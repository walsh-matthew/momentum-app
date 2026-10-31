// Pieces the sign-in, forgot-password and set-new-password cards share.

export const FIELD_CLASS =
  'min-h-11 rounded-lg border ctl-45 bg-background px-3 text-base font-normal text-foreground placeholder:text-muted';

export const LINK_CLASS = 'text-sm text-muted underline underline-offset-2 hover:text-foreground';

export function AuthBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <span className="momentum-mark" aria-hidden="true">
          m
        </span>
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.04em]" aria-hidden="true">
        momentum
      </span>
    </div>
  );
}
