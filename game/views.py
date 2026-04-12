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

from .models import Family, Child, Roll, Reward, Chest


PARENT_AUTH_TIMEOUT = 300


def get_family(user):
    family, _ = Family.objects.get_or_create(owner=user)
    return family


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
        "children": children
    })

def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")

        user = authenticate(request, username=username, password=password)

        if user:
            login(request, user)
            return redirect("dashboard")

        return render(request, "game/login.html", {"error": "Invalid login"})

    return render(request, "game/login.html")

def logout_view(request):
    logout(request)
    return redirect("login")


@login_required
def dashboard(request):
    if not is_parent_authenticated(request):
        return redirect("enter_pin")

    request.session["parent_auth_time"] = timezone.now().timestamp()

    family = get_family(request.user)
    children = list(family.children.all())

    for c in children:
        c.unopened_chests = c.chests.filter(is_opened=False)
        c.rolls_available = Reward.objects.filter(child=c, is_used=False).count()

    return render(request, "game/parentDashboard.html", {
        "children": children
    })


@login_required
def child_view(request, child_id):
    family = get_family(request.user)
    child = get_object_or_404(Child, id=child_id, family=family)

    chests = child.chests.filter(is_opened=False)
    rolls_available = Reward.objects.filter(child=child, is_used=False).count()

    return render(request, "game/child.html", {
        "child": child,
        "chests": chests,
        "rolls_available": rolls_available,
    })


@login_required
def add_child(request):
    if request.method == "POST":
        family = get_family(request.user)
        name = request.POST.get("name")
        colour = request.POST.get("colour")

        if name and colour:
            Child.objects.create(family=family, name=name, colour=colour)


    return redirect("dashboard")


# New function to give a chest directly to a child
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

    tier = request.POST.get("tier", "1")

    tier_map = {
        "1": "bronze",
        "2": "silver",
        "3": "gold",
    }

    tier_name = tier_map.get(tier, "bronze")

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

    tier = request.POST.get("tier", "1")
    tier_map = {"1": "bronze", "2": "silver", "3": "gold"}
    tier_name = tier_map.get(tier, "bronze")

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
def open_chest(request):
    chest_id = request.POST.get("chest_id")

    family = get_family(request.user)

    with transaction.atomic():
        chest = Chest.objects.select_for_update().filter(
            id=chest_id,
            child__family=family,
            is_opened=False
        ).first()

        if not chest:
            return JsonResponse({"success": False}, status=400)

        chest.is_opened = True
        chest.save()

        rewards = [
            Reward(child=chest.child)
            for _ in range(chest.rolls_awarded)
        ]

        Reward.objects.bulk_create(rewards)

    return JsonResponse({
        "success": True,
        "rolls_awarded": chest.rolls_awarded,
        "rolls_remaining": Reward.objects.filter(child=chest.child, is_used=False).count()
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

    child.position += roll_value
    child.save()

    Roll.objects.create(
        child=child,
        value=roll_value,
        position_after=child.position
    )

    return JsonResponse({
        "success": True,
        "roll": roll_value
    })


@login_required
def enter_pin(request):
    if request.method == "POST":
        family = get_family(request.user)
        pin = request.POST.get("pin")

        if pin == family.parent_pin:
            request.session["parent_authed"] = True
            request.session["parent_auth_time"] = timezone.now().timestamp()
            return redirect("dashboard")

        return render(request, "game/pin.html", {"error": "Invalid PIN"})

    return render(request, "game/pin.html")

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


# New function to reset the board for all children in the family
@login_required
@require_POST
def reset_board(request):
    family = get_family(request.user)

    children = Child.objects.filter(family=family)

    for child in children:
        child.position = 0
        child.save()

    # 🔥 THIS was your bug
    Chest.objects.filter(child__family=family).delete()
    Reward.objects.filter(child__family=family).delete()

    return JsonResponse({"success": True})

def signup(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")

        if username and password:
            from django.contrib.auth.models import User
            user = User.objects.create_user(username=username, password=password)
            login(request, user)
            return redirect("dashboard")

    return render(request, "game/signup.html")


# New function to change the parent's PIN
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


# Simple test endpoint for monitoring
@login_required
def sentry_test(request):
    return JsonResponse({"status": "ok"})



# New function to check parent authentication via AJAX
@login_required
def ping_auth(request):
    if is_parent_authenticated(request):
        return JsonResponse({"authenticated": True})
    return JsonResponse({"authenticated": False}, status=401)


# Custom password reset view
class CustomPasswordResetView(PasswordResetView):
    template_name = "registration/password_reset_form.html"
