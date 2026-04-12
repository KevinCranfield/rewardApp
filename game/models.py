from django.db import models
from django.contrib.auth.models import User


class Family(models.Model):
    owner = models.OneToOneField(User, on_delete=models.CASCADE)
    parent_pin = models.CharField(max_length=10, default="1234")

    def __str__(self):
        return f"{self.owner.username}'s family"


class Child(models.Model):

    COLOUR_CHOICES = [
        ("#ef4444", "Red"),
        ("#3b82f6", "Blue"),
        ("#22c55e", "Green"),
        ("#f59e0b", "Yellow"),
        ("#a855f7", "Purple"),
        ("#ec4899", "Pink"),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="children")

    name = models.CharField(max_length=100)
    colour = models.CharField(max_length=20, choices=COLOUR_CHOICES)

    position = models.IntegerField(default=0)

    def __str__(self):
        return self.name


class Roll(models.Model):
    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="rolls")

    value = models.IntegerField()
    position_after = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.child.name} rolled {self.value}"


class Chest(models.Model):
    TIER_CHOICES = [
        ("bronze", "Bronze"),
        ("silver", "Silver"),
        ("gold", "Gold"),
    ]

    ROLLS_BY_TIER = {
        "bronze": 1,
        "silver": 2,
        "gold": 3,
    }

    child = models.ForeignKey(Child, on_delete=models.CASCADE, related_name="chests")
    tier = models.CharField(max_length=10, choices=TIER_CHOICES)
    reason = models.CharField(max_length=200, blank=True)

    is_opened = models.BooleanField(default=False, db_index=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def rolls_awarded(self):
        return self.ROLLS_BY_TIER.get(self.tier, 1)

    def __str__(self):
        return f"{self.child.name} — {self.tier} chest ({'opened' if self.is_opened else 'unopened'})"


class Reward(models.Model):
    child = models.ForeignKey("Child", on_delete=models.CASCADE, related_name="rewards")

    reason = models.CharField(max_length=100)
    custom_text = models.CharField(max_length=200, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    is_used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.child.name} - {self.reason}"
