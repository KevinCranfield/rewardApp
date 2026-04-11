from django.shortcuts import render, redirect, get_object_or_404
from django.db.models import Count, Q, Prefetch
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.views import PasswordResetView
from django.contrib.auth.forms import PasswordResetForm
from django.utils import timezone
from datetime import timedelta
import random

from .models import Family, Child, Roll, Reward, Chest

def get_family(user):
    family, _ = Family.objects.get_or_create(owner=user)
    return family

def is_parent_authenticated(request):
    auth = request.session.get("parent_authed")
    auth_time = request.session.get("parent_auth_time")

    if not auth or not auth_time:
        return False

    if timezone.now().timestamp() - auth_time > 300:
        request.session["parent_authed"] = False
        return False

    return True

def home(request):
    children = []
    if request.user.is_authenticated:
        family = get_family(request.user)
        children = family.children.all()
    return render(request, "game/home.html", {"children": children})

@login_required
def dashboard(request):
    if not is_parent_authenticated(request):
        return redirect("enter_pin")

    request.session["parent_auth_time"] = timezone.now().timestamp()

    family = get_family(request.user)
    children = list(family.children.all())

    for c in children:
        c.unopened_chests = c.chests.filter(is_opened=False).order_by('-created_at')
        c.all_rewards = Reward.objects.filter(child=c).order_by('-created_at')

    context = {
        "children": children,
        "used_colours": [c.colour for c in children],
    }

    return render(request, "game/parentDashboard.html", context)


@login_required
def child_view(request, child_id):
    family = get_family(request.user)
    child = get_object_or_404(Child, id=child_id, family=family)
    
    child.unopened_chests = child.chests.filter(is_opened=False).order_by('-created_at')
    child.rolls_available = Reward.objects.filter(child=child, is_used=False).count()
    
    return render(request, "game/child.html", {"child": child})


@login_required
def add_child(request):
    if request.method == "POST":
        family = get_family(request.user)
        name = request.POST.get("name")
        colour = request.POST.get("colour")
        
        if name and colour:
            Child.objects.create(family=family, name=name, colour=colour)
        
        return redirect("dashboard")
    
    return redirect("dashboard")


@login_required
def roll(request):
    if request.method == "POST":
        family = get_family(request.user)
        child_id = request.POST.get("child_id")
        
        child = Child.objects.filter(id=child_id, family=family).first()
        if not child:
            return JsonResponse({"success": False, "error": "Invalid child"}, status=400)
        
        reward = Reward.objects.filter(child=child, is_used=False).first()
        if not reward:
            return JsonResponse({"success": False, "error": "No rolls available"}, status=400)
        
        reward.is_used = True
        reward.save()
        
        roll = Roll.objects.create(child=child, value=0)  # Dice roll happens on frontend
        
        return JsonResponse({
            "success": True,
            "rolls_remaining": Reward.objects.filter(child=child, is_used=False).count()
        })
    
    return JsonResponse({"success": False, "error": "Invalid request"}, status=400)


@login_required
def remove_child(request, child_id):
    family = get_family(request.user)
    child = get_object_or_404(Child, id=child_id, family=family)
    child.delete()
    return redirect("dashboard")


@login_required
def add_reward(request):
    if request.method == "POST":
        family = get_family(request.user)

        child = Child.objects.filter(
            id=request.POST.get("child_id"),
            family=family
        ).first()

        if not child:
            return redirect("dashboard")

        custom_text = request.POST.get("custom_text")
        if custom_text and custom_text.strip():
            reason = custom_text.strip()
        else:
            reason = request.POST.get("reason")

        tier = request.POST.get("tier", "1")
        tier_map = {"1": "bronze", "2": "silver", "3": "gold"}
        tier_name = tier_map.get(tier, "bronze")

        if reason and reason.strip():
            Chest.objects.create(
                child=child,
                tier=tier_name,
                reason=reason,
            )

        return redirect("dashboard")

    return redirect("dashboard")


@login_required
def open_chest(request):
    if request.method == "POST":
        import json
        
        data = json.loads(request.body)
        chest_id = data.get("chest_id")
        
        family = get_family(request.user)
        
        chest = Chest.objects.filter(
            id=chest_id,
            child__family=family,
            is_opened=False
        ).first()
        
        if not chest:
            return JsonResponse({"success": False, "error": "Chest not found"}, status=400)
        
        chest.is_opened = True
        chest.opened_at = timezone.now()
        chest.save()
        
        rolls_awarded = chest.rolls_awarded
        
        for _ in range(rolls_awarded):
            Reward.objects.create(
                child=chest.child,
                reason=chest.reason,
                is_used=False
            )
        
        unopened_count = chest.child.chests.filter(is_opened=False).count()
        total_rolls = chest.child.rewards.filter(is_used=False).count()
        
        return JsonResponse({
            "success": True,
            "rolls_awarded": rolls_awarded,
            "rolls_remaining": total_rolls,
            "unopened_chests": unopened_count,
        })
    
    return JsonResponse({"success": False, "error": "Invalid request"}, status=400)


@login_required
def change_pin(request):
    if request.method == "POST":
        family = get_family(request.user)
        new_pin = request.POST.get("new_pin")
        confirm_pin = request.POST.get("confirm_pin")
        
        if new_pin == confirm_pin and new_pin:
            family.parent_pin = new_pin
            family.save()
            return redirect("dashboard")
    
    return redirect("dashboard")


def enter_pin(request):
    if request.method == "POST":
        family = get_family(request.user)
        pin = request.POST.get("pin")
        
        if pin == family.parent_pin:
            request.session["parent_authed"] = True
            request.session["parent_auth_time"] = timezone.now().timestamp()
            return redirect("dashboard")
        else:
            return render(request, "game/enter_pin.html", {"error": "Invalid PIN"})
    
    return render(request, "game/enter_pin.html")


def ping_auth(request):
    """Keep parent session alive"""
    if is_parent_authenticated(request):
        request.session["parent_auth_time"] = timezone.now().timestamp()
        return JsonResponse({"success": True})
    return JsonResponse({"success": False}, status=401)


@login_required
@require_POST
def reset_board(request):
    family = get_family(request.user)
    
    Roll.objects.filter(child__family=family).delete()
    Reward.objects.filter(child__family=family).delete()
    Chest.objects.filter(child__family=family).delete()
    
    return JsonResponse({"success": True})


def give_chest(request):
    """Alias for add_reward"""
    return add_reward(request)

