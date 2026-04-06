from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.models import User

class CustomPasswordResetForm(PasswordResetForm):
    def get_users(self, email):
        email = (email or "").strip()
        return User.objects.filter(email__iexact=email, is_active=True)