from django.shortcuts import render, redirect, get_object_or_404
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.contrib.auth import authenticate, login, logout
from django.utils import timezone
import random

from django.contrib.auth.views import PasswordResetView
from django.db.models import Q
from django.core.cache import cache
import time
def rate_limit(key, seconds=1):
    now = time.time()
    last = cache.get(key)

    if last and now - last < seconds:
        return False

    cache.set(key, now, timeout=seconds)
    return True

from .models import Family, Child, Roll, Reward, Chest, RewardType, MainReward


PARENT_AUTH_TIMEOUT = 300


def build_board():
    squares = []
    num = 1

    for row in range(8):
        current_row = []
        for col in range(8):
            current_row.append(num)
            num += 1

        if row % 2 == 1:
            current_row.reverse()

        squares.append(current_row)

    squares.reverse()
    return squares


def get_family(user):
    family, _ = Family.objects.get_or_create(owner=user)
    return family


def get_children_context(request):
    if request.user.is_authenticated:
        return {"children": get_family(request.user).children.all()}
    return {"children": []}


def is_parent_authenticated(request):
    auth = request.session.get("parent_authed")
    auth_time = request.session.get("parent_auth_time")

    if not auth or not auth_time:
        return False

    if timezone.now().timestamp() - auth_time > PARENT_AUTH_TIMEOUT:
        request.session["parent_authed"] = False
        return False

    return True


def home(request):
    children = []
    if request.user.is_authenticated:
        family = get_family(request.user)
        children = family.children.all()

    return render(request, "game/home.html", {
        "children": list(children)
    })


def login_view(request):
    if request.method == "POST":
        user = authenticate(
            request,
            username=request.POST.get("username"),
            password=request.POST.get("password")
        )

        if user:
            login(request, user)
            return redirect("dashboard")

        return render(request, "game/login.html", {"error": "Invalid login", **get_children_context(request)})

    return render(request, "game/login.html", get_children_context(request))


def logout_view(request):
    logout(request)
    return redirect("login")


@login_required
def dashboard(request):
    family = get_family(request.user)

    if not family.children.exists():
        return redirect("setup_page")

    if not is_parent_authenticated(request):
        return redirect("enter_pin")

    request.session["parent_auth_time"] = timezone.now().timestamp()

    children = list(family.children.all())
    for c in children:
        c.unopened_chests = c.chests.filter(is_opened=False)

    return render(request, "game/parentDashboard.html", {
        "children": children
    })


@login_required
def setup_page(request):
    family = get_family(request.user)

    return render(request, "game/setup.html", {
        "children": family.children.all()
    })


@login_required
def child_view(request, child_id):
    family = get_family(request.user)
    child = get_object_or_404(Child, id=child_id, family=family)

    return render(request, "game/child.html", {
        "child": child,
        "children": list(Child.objects.filter(family=family)),
        "chests": child.chests.filter(is_opened=False),
        "rolls_available": 0,
        "squares": build_board(),
        "main_reward": child.main_reward,
    })


@login_required
@transaction.atomic
@require_POST
def roll(request):
    family = get_family(request.user)
    if not rate_limit(f"roll_{request.user.id}", 1):
        return JsonResponse({"error": "Too many requests"}, status=429)

    try:
        child_id = int(request.POST.get("child_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Invalid child_id"}, status=400)

    child = get_object_or_404(Child, id=child_id, family=family)

    reward = Reward.objects.select_for_update().filter(child=child, is_used=False).first()
    if not reward:
        return JsonResponse({"success": False}, status=400)

    reward.is_used = True
    reward.save()

    roll_value = random.randint(1, 6)
    old_position = child.position

    new_position = min(child.position + roll_value, 64)

    snakes = {62: 44, 55: 41, 27: 10, 33: 18}
    ladders = {3: 22, 8: 26, 19: 38, 35: 49}

    jump_from = None
    jump_to = None

    child.position = new_position

    if new_position in ladders:
        jump_from = new_position
        jump_to = ladders[new_position]
        child.position = jump_to
    elif new_position in snakes:
        jump_from = new_position
        jump_to = snakes[new_position]
        child.position = jump_to

    child.save()

    Roll.objects.create(child=child, value=roll_value, position_after=child.position)

    remaining = Reward.objects.filter(child=child, is_used=False).count()

    children_data = [
        {"id": c.id, "name": c.name, "colour": c.colour, "position": c.position}
        for c in Child.objects.filter(family=family)
    ]

    reward_data = None
    if child.position == 64 and child.main_reward:
        reward_data = {
            "name": child.main_reward.name,
            "image": child.main_reward.image.url if child.main_reward.image else None
        }

    return JsonResponse({
        "success": True,
        "dice": roll_value,
        "position": child.position,
        "rolls_remaining": remaining,
        "jump": jump_to is not None,
        "from": jump_from,
        "children": children_data,
        "reward": reward_data,
        "start": old_position,
    })


@login_required
@require_POST
def open_chest(request, chest_id=None):
    family = get_family(request.user)
    if not rate_limit(f"chest_{request.user.id}", 1):
        return JsonResponse({"error": "Too many requests"}, status=429)

    if chest_id is None:
        chest_id = request.POST.get("chest_id")

    try:
        chest_id = int(chest_id)
    except (TypeError, ValueError):
        return JsonResponse({"error": "Invalid chest_id"}, status=400)

    with transaction.atomic():
        chest = get_object_or_404(
            Chest.objects.select_for_update(),
            id=chest_id,
            child__family=family
        )

        if chest.is_opened:
            return JsonResponse({"success": True, "already_opened": True})

        chest.is_opened = True
        chest.save()

        rolls = {"gold": 3, "silver": 2}.get(chest.tier, 1)
        Reward.objects.bulk_create([Reward(child=chest.child) for _ in range(rolls)])

    return JsonResponse({
        "success": True,
        "rolls_awarded": rolls,
        "rolls": Reward.objects.filter(child=chest.child, is_used=False).count()
    })


@login_required
@require_POST
def get_child_state(request):
    family = get_family(request.user)

    try:
        child_id = int(request.GET.get("child_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Invalid child_id"}, status=400)

    child = get_object_or_404(Child, id=child_id, family=family)

    return JsonResponse({
        "rolls_remaining": Reward.objects.filter(child=child, is_used=False).count()
    })


@login_required
@require_POST
def add_reward_type(request):
    if request.method == "POST":
        family = get_family(request.user)
        if not rate_limit(f"reward_{request.user.id}", 1):
            return redirect("setup_page")

        try:
            child_id = int(request.POST.get("child_id"))
        except (TypeError, ValueError):
            return redirect("setup_page")

        child = get_object_or_404(Child, id=child_id, family=family)

        name = request.POST.get("name")
        image = request.FILES.get("image")

        if name:
            RewardType.objects.create(
                name=name,
                image=image if getattr(request.user, "is_premium", False) else None,
                child=child,
                user=request.user
            )

    return redirect("setup_page")


@login_required
@require_POST
def set_main_reward(request):
    if request.method == "POST":
        family = get_family(request.user)

        try:
            child_id = int(request.POST.get("child_id"))
        except (TypeError, ValueError):
            return JsonResponse({"success": False}, status=400)

        try:
            reward_id = int(request.POST.get("reward_id"))
        except (TypeError, ValueError):
            return JsonResponse({"success": False}, status=400)

        child = get_object_or_404(Child, id=child_id, family=family)

        reward = get_object_or_404(
            MainReward,
            Q(is_preset=True) | Q(family=family),
            id=reward_id
        )

        if reward:
            child.main_reward = reward
            child.save()
            return JsonResponse({"success": True})

        return JsonResponse({"success": False}, status=400)

    return JsonResponse({"success": False}, status=405)


class CustomPasswordResetView(PasswordResetView):
    template_name = "registration/password_reset_form.html"