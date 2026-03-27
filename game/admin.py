from django.contrib import admin
from .models import Family, Child, Roll
from .models import Reward

@admin.register(Reward)
class RewardAdmin(admin.ModelAdmin):
    list_display = ("child", "reason", "custom_text", "is_used", "created_at")
    list_filter = ("child", "is_used")
    search_fields = ("reason", "custom_text")

admin.site.register(Family)
admin.site.register(Child)
admin.site.register(Roll)