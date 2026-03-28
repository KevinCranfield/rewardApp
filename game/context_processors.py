from .models import Family

def children_context(request):

    if not request.user.is_authenticated:
        return {}

    family, _ = Family.objects.get_or_create(owner=request.user)
    children = family.children.all()

    return {
        "children": children
    }