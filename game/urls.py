from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

urlpatterns = [
    path("", views.home, name="home"),              # 🏠 HOME
    path("dashboard/", views.dashboard, name="dashboard"),  # 👨‍👩‍👧 PARENT

    # 👶 CHILD GAME (by id)
    path("child/<int:child_id>/", views.child_view, name="child_view"),

    # 🎯 ACTIONS
    path("add-child/", views.add_child, name="add_child"),
    path("remove-child/<int:child_id>/", views.remove_child, name="remove_child"),
    path("add-reward/", views.add_reward, name="add_reward"),
    path("roll/", views.roll, name="roll"),
    path("reset-board/", views.reset_board, name="reset_board"),

    # 🎁 CHESTS
    path("give-chest/", views.give_chest, name="give_chest"),
    path("open-chest/", views.open_chest, name="open_chest"),

    # 🔐 AUTH
    path("login/", views.login_view, name="login"),
    path("signup/", views.signup, name="signup"),
    path("logout/", views.logout_view, name="logout"),

    # 🔒 PIN PROTECTION
    path("enter-pin/", views.enter_pin, name="enter_pin"),
    path("change-pin/", views.change_pin, name="change_pin"),
    path("ping-auth/", views.ping_auth, name="ping_auth"),

    # 🔑 PASSWORD RESET
    path("forgot-password/", views.CustomPasswordResetView.as_view(
        template_name="game/password_reset.html",
        email_template_name="game/password_reset_email.html",
        subject_template_name="game/password_reset_subject.txt",
        success_url="/forgot-password/done/"
    ), name="password_reset"),

    path("forgot-password/done/", auth_views.PasswordResetDoneView.as_view(
        template_name="game/password_reset_done.html"
    ), name="password_reset_done"),

    path("reset/<uidb64>/<token>/", auth_views.PasswordResetConfirmView.as_view(
        template_name="game/password_reset_confirm.html",
        success_url="/reset/done/"
    ), name="password_reset_confirm"),

    path("reset/done/", auth_views.PasswordResetCompleteView.as_view(
        template_name="game/password_reset_complete.html"
    ), name="password_reset_complete"),

    path("sentry-test/", views.sentry_test, name="sentry_test"),
]

