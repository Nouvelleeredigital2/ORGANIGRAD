export function canAdminManageMember({
    isAdmin,
    isOwner,
    isSelf,
}: {
    isAdmin: boolean;
    isOwner: boolean;
    isSelf: boolean;
}) {
    return isAdmin && !isOwner && !isSelf;
}

export function canLoadApiKeys(isAdmin: boolean) {
    return isAdmin;
}

export function mayReplaceUncopiedKey(hasRevealedKey: boolean, confirmed: boolean) {
    return !hasRevealedKey || confirmed;
}
