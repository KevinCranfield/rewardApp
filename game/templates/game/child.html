from django.shortcuts import render, redirect, get_object_or_404
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.contrib.auth import authenticate, login, logout
from django.utils import timezone
import random
import json

from django.contrib.auth.views import PasswordResetView
from django.db.models import Q

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


# Helper for children context
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

    children_list = list(children)

    return render(request, "game/home.html", {
        "children": children_list
    })

def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")

        user = authenticate(request, username=username, password=password)

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

    # If no children yet → onboarding flow
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
def child_view(request, child_id):
    family = get_family(request.user)
    child = get_object_or_404(Child, id=child_id, family=family)

    chests = child.chests.filter(is_opened=False)

    return render(request, "game/child.html", {
        "child": child,
        "children": list(Child.objects.filter(family=family)),
        "chests": chests,
        "rolls_available": 0,
        "squares": build_board(),
        "main_reward": child.main_reward,  # 🎯 pass main reward to template
    })


@login_required
def add_child(request):
    if request.method == "POST":
        family = get_family(request.user)

        # 🔒 FREE PLAN LIMIT: only 1 child allowed
        if not getattr(request.user, "is_premium", False):
            if family.children.count() >= 1:
                return JsonResponse({
                    "success": False,
                    "error": "Free plan allows only 1 child. Upgrade to add more."
                }, status=400)

        name = request.POST.get("name")
        colour = request.POST.get("colour")

        if name and colour:
            child = Child.objects.create(family=family, name=name, colour=colour)

            # 🎁 Give first chest automatically (onboarding)
            Chest.objects.create(
                child=child,
                tier="bronze",
                reason="First reward 🎉",
                is_opened=False
            )

        # If AJAX request, return JSON
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({
                "success": True,
                "child": {
                    "id": child.id,
                    "name": child.name,
                    "colour": child.colour
                }
            })

        return redirect("setup_page")


@login_required
@require_POST
def give_chest(request):
    family = get_family(request.user)

    child = Child.objects.filter(
        id=request.POST.get("child_id"),
        family=family
    ).first()

    if not child:
        return JsonResponse({"success": False}, status=400)

    tier = (
        request.POST.get("tier")
        or request.POST.get("chest_type")
        or request.POST.get("rolls")
        or "bronze"
    )

    tier_map = {
        "1": "bronze",
        "2": "silver",
        "3": "gold",
        "bronze": "bronze",
        "silver": "silver",
        "gold": "gold",
    }

    tier_name = tier_map.get(str(tier).lower(), "bronze")

    # Enforce free tier restriction
    if not getattr(request.user, "is_premium", False):
        tier_name = "bronze"

    chest = Chest.objects.create(
        child=child,
        tier=tier_name,
        reason="manual",
        is_opened=False
    )

    return JsonResponse({
        "success": True,
        "tier": chest.tier,
        "rolls": chest.rolls_awarded
    })


@login_required
@require_POST
def add_reward(request):
    family = get_family(request.user)

    child = Child.objects.filter(
        id=request.POST.get("child_id"),
        family=family
    ).first()

    if not child:
        return JsonResponse({"success": False, "error": "Invalid child"}, status=400)

    reason = request.POST.get("reason")

    if not reason:
        return JsonResponse({"success": False, "error": "Missing reason"}, status=400)

    tier = (
        request.POST.get("tier")
        or request.POST.get("chest_type")
        or request.POST.get("rolls")
        or "bronze"
    )

    tier_map = {
        "1": "bronze",
        "2": "silver",
        "3": "gold",
        "bronze": "bronze",
        "silver": "silver",
        "gold": "gold",
    }

    tier_name = tier_map.get(str(tier).lower(), "bronze")

    # Enforce free tier restriction
    if not getattr(request.user, "is_premium", False):
        tier_name = "bronze"

    chest = Chest.objects.create(
        child=child,
        tier=tier_name,
        reason=reason,
        is_opened=False
    )

    return JsonResponse({
        "success": True,
        "tier": chest.tier,
        "rolls": chest.rolls_awarded
    })


@login_required
@require_POST
def open_chest(request, chest_id=None):
    family = get_family(request.user)
    if chest_id is None:
        chest_id = request.POST.get("chest_id")

    with transaction.atomic():
        chest = Chest.objects.select_for_update().filter(
            id=chest_id,
            child__family=family
        ).first()

        if not chest:
            return JsonResponse({
                "success": False,
                "error": "Chest not found"
            }, status=400)

        if chest.is_opened:
            return JsonResponse({
                "success": True,
                "already_opened": True
            })

        chest.is_opened = True
        chest.save()

        if chest.tier == "gold":
            rolls_to_award = 3
        elif chest.tier == "silver":
            rolls_to_award = 2
        else:
            rolls_to_award = 1

        rewards = [
            Reward(child=chest.child)
            for _ in range(rolls_to_award)
        ]
        Reward.objects.bulk_create(rewards)

    total_rolls = Reward.objects.filter(
        child=chest.child,
        is_used=False
    ).count()

    return JsonResponse({
        "success": True,
        "tier": chest.tier,
        "rolls_awarded": rolls_to_award,
        "rolls": total_rolls
    })


@login_required
@require_POST
def roll(request):
    family = get_family(request.user)
    child_id = request.POST.get("child_id")

    child = Child.objects.filter(id=child_id, family=family).first()

    if not child:
        return JsonResponse({"success": False}, status=400)

    reward = Reward.objects.filter(child=child, is_used=False).first()

    if not reward:
        return JsonResponse({"success": False}, status=400)

    reward.is_used = True
    reward.save()

    roll_value = random.randint(1, 6)

    new_position = child.position + roll_value

    if new_position > 64:
        new_position = 64

    snakes = {
        62: 44,
        55: 41,
        27: 10,
        33: 18,
    }

    ladders = {
        3: 22,
        8: 26,
        19: 38,
        35: 49,
    }

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

    Roll.objects.create(
        child=child,
        value=roll_value,
        position_after=child.position
    )

    remaining = Reward.objects.filter(child=child, is_used=False).count()

    all_children = Child.objects.filter(family=family)
    children_data = [
        {
            "id": c.id,
            "name": c.name,
            "colour": c.colour,
            "position": c.position,
        }
        for c in all_children
    ]

    # 🎁 Main reward trigger when reaching square 64
    reward_data = None
    if child.position == 64 and getattr(child, "main_reward", None):
        reward_obj = child.main_reward
        reward_data = {
            "name": reward_obj.name,
            "image": reward_obj.image.url if reward_obj.image else None
        }

    return JsonResponse({
        "success": True,
        "dice": roll_value,
        "roll": roll_value,
        "position": child.position,
        "rolls_remaining": remaining,
        "jump": jump_to is not None,
        "from": jump_from,
        "children": children_data,
        "reward": reward_data,
    })


def enter_pin(request):
    if request.method == "POST":
        family = get_family(request.user)
        pin = request.POST.get("pin")

        if pin == family.parent_pin:
            request.session["parent_authed"] = True
            request.session["parent_auth_time"] = timezone.now().timestamp()
            return redirect("dashboard")

        return render(request, "game/pin.html", {"error": "Invalid PIN", **get_children_context(request)})

    return render(request, "game/pin.html", get_children_context(request))

@login_required
@require_POST
def remove_child(request, child_id):
    family = get_family(request.user)
    child = get_object_or_404(Child, id=child_id, family=family)

    Chest.objects.filter(child=child).delete()
    Reward.objects.filter(child=child).delete()
    Roll.objects.filter(child=child).delete()

    child.delete()

    return JsonResponse({"success": True})


@login_required
@require_POST
def reset_board(request):
    family = get_family(request.user)

    children = Child.objects.filter(family=family)

    for child in children:
        child.position = 0
        child.save()

    Chest.objects.filter(child__family=family).delete()
    Reward.objects.filter(child__family=family).delete()

    children_data = [
        {
            "id": c.id,
            "name": c.name,
            "colour": c.colour,
            "position": c.position,
        }
        for c in children
    ]

    return JsonResponse({
        "success": True,
        "children": children_data,
    })


def signup(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")

        if username and password:
            from django.contrib.auth.models import User
            user = User.objects.create_user(username=username, password=password)
            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
            return redirect("setup_page")

    return render(request, "game/signup.html", get_children_context(request))


@login_required
def change_pin(request):
    family = get_family(request.user)

    if request.method == "POST":
        new_pin = request.POST.get("pin")

        if new_pin:
            family.parent_pin = new_pin
            family.save()
            return redirect("dashboard")

    return render(request, "game/change_pin.html")


@login_required
def sentry_test(request):
    return JsonResponse({"status": "ok"})


@login_required
def ping_auth(request):
    if is_parent_authenticated(request):
        return JsonResponse({"authenticated": True})
    return JsonResponse({"authenticated": False}, status=401)


@login_required
def get_child_state(request):
    family = get_family(request.user)
    child_id = request.GET.get("child_id")

    child = Child.objects.filter(id=child_id, family=family).first()

    if not child:
        return JsonResponse({"error": "Child not found"}, status=404)

    rolls_remaining = Reward.objects.filter(
        child=child,
        is_used=False
    ).count()

    return JsonResponse({
        "rolls_remaining": rolls_remaining
    })


# ⚙️ Setup page
@login_required
def setup_page(request):
    family = get_family(request.user)
    children = list(family.children.all())
    is_premium = getattr(request.user, "is_premium", False)

    # 🎯 Main rewards: presets always visible, family custom rewards for paid tier
    if is_premium:
        main_rewards = MainReward.objects.filter(
            Q(is_preset=True) | Q(family=family)
        )
    else:
        main_rewards = MainReward.objects.filter(is_preset=True)

    return render(request, "game/setup.html", {
        "children": children,
        "main_rewards": main_rewards,
        "is_premium": is_premium,
    })


# 🎁 Add reward type for a specific child (chest reasons)
@login_required
def add_reward_type(request):
    if request.method == "POST":
        family = get_family(request.user)

        child_id = request.POST.get("child_id")
        name = request.POST.get("name")
        image = request.FILES.get("image")

        # 🔒 Enforce premium for image uploads
        if not getattr(request.user, "is_premium", False):
            image = None

        child = Child.objects.filter(id=child_id, family=family).first()

        if child and name:
            RewardType.objects.create(
                name=name,
                image=image,
                child=child,
                user=request.user
            )

    return redirect("setup_page")


# 🎯 Set main reward (square 64 goal) for a child
@login_required
def set_main_reward(request):
    if request.method == "POST":
        family = get_family(request.user)

        child_id = request.POST.get("child_id")
        reward_id = request.POST.get("reward_id")

        if not child_id or not reward_id:
            return JsonResponse({"success": False}, status=400)

        child = Child.objects.filter(id=child_id, family=family).first()

        # Free tier: only presets allowed
        is_premium = getattr(request.user, "is_premium", False)
        if is_premium:
            reward = MainReward.objects.filter(
                Q(is_preset=True) | Q(family=family),
                id=reward_id
            ).first()
        else:
            reward = MainReward.objects.filter(id=reward_id, is_preset=True).first()

        if child and reward:
            child.main_reward = reward
            child.save()
            return JsonResponse({"success": True})

        return JsonResponse({"success": False}, status=400)

    return JsonResponse({"success": False}, status=405)


# 🎯 Add custom main reward (paid tier only)
@login_required
@require_POST
def add_main_reward(request):
    if not getattr(request.user, "is_premium", False):
        return JsonResponse({"success": False, "error": "Premium only"}, status=403)

    family = get_family(request.user)
    name = request.POST.get("name")
    image = request.FILES.get("image")

    if not name:
        return JsonResponse({"success": False, "error": "Name required"}, status=400)

    reward = MainReward.objects.create(
        name=name,
        image=image,
        is_preset=False,
        family=family
    )

    return JsonResponse({
        "success": True,
        "id": reward.id,
        "name": reward.name,
        "image": reward.image.url if reward.image else None
    })


class CustomPasswordResetView(PasswordResetView):
    template_name = "registration/password_reset_form.html"

