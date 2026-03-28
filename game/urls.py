from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),              # 🏠 HOME
    path("dashboard/", views.dashboard, name="dashboard"),  # 👨‍👩‍👧 PARENT

    # 👶 CHILD GAME (by id)
    path("child/<int:child_id>/", views.child_view, name="child_view"),

    # 🎯 ACTIONS
    path("add-child/", views.add_child, name="add_child"),
    path("remove-child/", views.remove_child, name="remove_child"),
    path("add-reward/", views.add_reward, name="add_reward"),
    path("roll/", views.roll, name="roll"),
    path("reset-board/", views.reset_board, name="reset_board"),

    # 🔐 AUTH
    path("login/", views.login_view, name="login"),
    path("signup/", views.signup, name="signup"),
    path("logout/", views.logout_view, name="logout"),

    # 🔒 PIN PROTECTION
    path("enter-pin/", views.enter_pin, name="enter_pin"),
    path("change-pin/", views.change_pin, name="change_pin"),
    path("ping-auth/", views.ping_auth, name="ping_auth"),
]