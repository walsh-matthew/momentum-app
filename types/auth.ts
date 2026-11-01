// State returned by the sign-in / sign-up Server Action to the form (components/auth).
export interface AuthFormState {
  error: string | null;
  notice: string | null;
  // The address a sign-up confirmation link was sent to (MOM-150). Set only after a sign-up that needs the person to confirm.
  sentTo?: string | null;
}

// The state of the "forgot password" and "set a new password" forms. `notice` is the neutral success message.
export type PasswordFormState = AuthFormState;

// The CAPTCHA a deployment has switched on (MOM-64). Absent means no widget and no token.
export type CaptchaProvider = 'turnstile' | 'hcaptcha';

export interface CaptchaConfig {
  provider: CaptchaProvider;
  siteKey: string;
}

// The name of the hidden form field that carries the widget's token to the Server Action.
export const CAPTCHA_FIELD = 'captchaToken';
