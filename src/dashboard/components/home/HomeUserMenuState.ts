interface UserMenuControllerOptions {
    onOpenChange: (open: boolean) => void;
    focusTrigger: () => void;
    containsTarget: (target: unknown) => boolean;
    onLogout: (all?: boolean) => Promise<void>;
}

export const initialsFromDisplayName = (displayName?: string | null) => {
    const parts = displayName?.trim().split(/\s+/).filter(Boolean) ?? [];
    return parts.slice(0, 2).map(part => part[0]).join("").toUpperCase();
};

export class UserMenuController {
    private isOpen = false;
    private readonly options: UserMenuControllerOptions;

    constructor(options: UserMenuControllerOptions) {
        this.options = options;
    }

    get open() {
        return this.isOpen;
    }

    toggle() {
        this.setOpen(!this.isOpen);
    }

    handleKeyDown(key: string) {
        if (key === "Escape" && this.isOpen) this.dismiss();
    }

    handlePointerDown(target: unknown) {
        if (this.isOpen && !this.options.containsTarget(target)) this.dismiss();
    }

    async logout() {
        this.setOpen(false);
        await this.options.onLogout(false);
    }

    closeForNavigation() {
        this.setOpen(false);
    }

    private dismiss() {
        this.setOpen(false);
        this.options.focusTrigger();
    }

    private setOpen(open: boolean) {
        if (this.isOpen === open) return;
        this.isOpen = open;
        this.options.onOpenChange(open);
    }
}
