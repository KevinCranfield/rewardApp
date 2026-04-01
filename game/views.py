from django.shortcuts import render, redirect, get_object_or_404
from django.db.models import Count, Q, Prefetch
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
import random

from .models import Family, Child, Roll, Reward

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
    return render(request, "game/home.html")

@login_required
def dashboard(request):

    if not is_parent_authenticated(request):
        return redirect("enter_pin")

    # 🔄 refresh activity timer
    request.session["parent_auth_time"] = timezone.now().timestamp()

    family = get_family(request.user)

    children = list(
        family.children
        .all()
        .annotate(available_rewards=Count('rewards', filter=Q(rewards__is_used=False)))
    )

    # 🔥 attach rewards manually (guaranteed sync fix)
    rewards = Reward.objects.filter(child__family=family).order_by('-created_at')

    for c in children:
        c.all_rewards = [r for r in rewards if r.child_id == c.id]

    # add last roll per child (avoid N+1 by fetching once per child id)
    last_rolls = (
        Roll.objects
        .filter(child__in=children)
        .order_by('child_id', '-id')
    )
    last_map = {}
    for r in last_rolls:
        if r.child_id not in last_map:
            last_map[r.child_id] = r.dice
    for c in children:
        c.last_roll = last_map.get(c.id)


    # 🔥 recent rewards history
    recent_rewards = Reward.objects.filter(
        child__family=family
    ).select_related("child").order_by("-created_at")[:15]

    used_colours = list(
        Child.objects.filter(family=family)
        .values_list("colour", flat=True)
    )

    return render(request, "game/parentDashboard.html", {
        "children": children,
        "recent_rewards": recent_rewards,
        "used_colours": used_colours
    })

@login_required
def child_view(request, child_id):

    family = get_family(request.user)
    # 🔐 force PIN re-check when returning to dashboard
    request.session["parent_authed"] = False

    child = Child.objects.filter(
        id=child_id,
        family=family
    ).first()

    if not child:
        return redirect("dashboard")

    children = family.children.all()

    # rewards count
    child.available_rewards = child.rewards.filter(is_used=False).count()

    # last roll
    last_roll = Roll.objects.filter(child=child).order_by("-id").first()
    child.last_roll = last_roll.dice if last_roll else None

    # progress percentage
    child.progress_percent = int((child.position / 64) * 100)

    # board
    squares = []
    for row in range(8):
        nums = list(range(row * 8 + 1, row * 8 + 9))
        if row % 2 == 1:
            nums.reverse()
        squares.insert(0, nums)

    return render(request, "game/child.html", {
        "child": child,
        "children": children,
        "squares": squares
    })


@login_required
def add_child(request):

    if request.method == "POST":

        name = request.POST.get("name")
        colour = request.POST.get("colour")

        family = get_family(request.user)

        # 🚫 prevent duplicate colours
        if Child.objects.filter(family=family, colour=colour).exists():
            return redirect("dashboard")

        if name and colour:
            Child.objects.create(
                family=family,
                name=name,
                colour=colour
            )

    return redirect("dashboard")


@login_required
def roll(request):

    if request.method == "POST":
        import json
        try:
            data = json.loads(request.body)
            child_id = data.get("child_id")
        except:
            child_id = request.POST.get("child_id")

        family = get_family(request.user)

        child = Child.objects.filter(
            id=child_id,
            family=family
        ).first()

        if not child:
            return JsonResponse({"error": "invalid child"}, status=400)

        print("[ROLL] child_id:", child.id)
        print("[ROLL] unused rewards BEFORE:", child.rewards.filter(is_used=False).count())

        # 🔥 ONLY ALLOW ROLL IF REWARD EXISTS
        reward = child.rewards.filter(is_used=False).first()

        if not reward:
            return JsonResponse({"error": "no reward"}, status=400)

        dice = random.randint(1, 4)

        SNAKES = {
            62: 44,
            55: 41,
            27: 10,
            33: 18,
        }

        LADDERS = {
            3: 22,
            8: 26,
            19: 38,
            35: 49,
        }

        start_pos = child.position
        roll_target = min(start_pos + dice, 64)

        jump = None
        final_pos = roll_target

        if roll_target in SNAKES:
            final_pos = SNAKES[roll_target]
            jump = "snake"
        elif roll_target in LADDERS:
            final_pos = LADDERS[roll_target]
            jump = "ladder"

        child.position = final_pos
        child.save()

        reward.is_used = True
        reward.save()

        print("[ROLL] used reward id:", reward.id)
        print("[ROLL] unused rewards AFTER:", child.rewards.filter(is_used=False).count())

        Roll.objects.create(
            child=child,
            dice=dice,
            position_after=final_pos
        )

        rolls_remaining = child.rewards.filter(is_used=False).count()

        print("[ROLL] rolls_remaining sent:", rolls_remaining)

        return JsonResponse({
            "dice": dice,
            "position": final_pos,
            "from": roll_target,
            "jump": jump,
            "rolls_remaining": rolls_remaining,
            "children": list(
                Child.objects.filter(family=child.family)
                .values("id", "name", "colour", "position")
            )
        })
    


@login_required
def remove_child(request, child_id):
    if request.method == "POST":
        family = get_family(request.user)

        child = Child.objects.filter(
            id=child_id,
            family=family
        ).first()

        if child:
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
            return JsonResponse({"success": False, "error": "Invalid child"}, status=400)

        # Use custom reason if provided
        custom_text = request.POST.get("custom_text")
        if custom_text and custom_text.strip():
            reason = custom_text.strip()
        else:
            reason = request.POST.get("reason")

        rolls = max(1, min(int(request.POST.get("rolls", 1)), 3))

        print("[ADD_REWARD] child_id:", child.id)
        print("[ADD_REWARD] rolls requested:", rolls)

        if reason and reason.strip():
            created_rewards = []

            for _ in range(rolls):
                reward = Reward.objects.create(
                    child=child,
                    reason=reason,
                    custom_text=custom_text or ""
                )
                print(f"[ADD_REWARD] created reward id={reward.id} for child={child.id}")
                created_rewards.append(reward)

            total_unused = child.rewards.filter(is_used=False).count()
            print("[ADD_REWARD] total unused rewards now:", total_unused)

            return JsonResponse({
                "success": True,
                "count": rolls,
                "rewards": [
                    {
                        "id": r.id,
                        "reason": r.reason,
                        "custom_text": r.custom_text
                    } for r in created_rewards
                ]
            })

        return JsonResponse({"success": False, "error": "No reason provided"}, status=400)

    return JsonResponse({"success": False, "error": "Invalid request"}, status=400)

@login_required
def change_pin(request):

    if request.method == "POST":
        family = get_family(request.user)

        new_pin = request.POST.get("new_pin")

        if new_pin and len(new_pin) >= 4:
            family.parent_pin = new_pin
            family.save()

    return redirect("dashboard")
from django.views.decorators.http import require_POST

@login_required
@require_POST
def reset_board(request):
    if not is_parent_authenticated(request):
        return JsonResponse({"success": False, "error": "Not authorised"}, status=403)

    family = get_family(request.user)

    # 🎯 Reset all children positions
    Child.objects.filter(family=family).update(position=1)

    # 🎯 Mark all rewards as used (so 'available' becomes 0)
    Reward.objects.filter(child__family=family).update(is_used=True)

    # 🎯 Clear rolls so 'last roll' and recent gameplay reset (UI shows empty)
    Roll.objects.filter(child__family=family).delete()

    return JsonResponse({"success": True})

@login_required
def ping_auth(request):
    request.session["parent_auth_time"] = timezone.now().timestamp()
    return JsonResponse({"ok": True})

@login_required
def enter_pin(request):

    family = get_family(request.user)
    error = None

    if request.method == "POST":
        pin = request.POST.get("pin")

        if pin == getattr(family, "parent_pin", "1234"):
            request.session["parent_authed"] = True
            request.session["parent_auth_time"] = timezone.now().timestamp()
            return redirect("dashboard")
        else:
            error = "Incorrect PIN"

    return render(request, "game/pin.html", {"error": error})

def login_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")

    error = None
    if request.method == "POST":
        user = authenticate(
            username=request.POST.get("username"),
            password=request.POST.get("password")
        )
        if user:
            login(request, user)
            return redirect("dashboard")
        else:
            error = "Invalid username or password"

    return render(request, "game/login.html", {"error": error})


def logout_view(request):
    logout(request)
    return redirect("login")


def signup(request):
    if request.user.is_authenticated:
        return redirect("dashboard")

    error = None

    if request.method == "POST":
        username = request.POST.get("username")
        email = request.POST.get("email")
        password = request.POST.get("password")
        confirm = request.POST.get("confirm_password")

        if not username or not email or not password or not confirm:
            error = "Please fill all fields"

        elif password != confirm:
            error = "Passwords do not match"

        elif len(password) < 6:
            error = "Password must be at least 6 characters"

        elif not any(char.isdigit() for char in password):
            error = "Password must contain a number"

        elif User.objects.filter(username=username).exists():
            error = "Username already exists"

        elif User.objects.filter(email=email).exists():
            error = "Email already used"

        else:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password
            )

            login(request, user)
            return redirect("dashboard")

    return render(request, "game/signup.html", {"error": error})