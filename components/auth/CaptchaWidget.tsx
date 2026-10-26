'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { CAPTCHA_FIELD, type CaptchaConfig, type CaptchaProvider } from '@/types/auth';

interface CaptchaWidgetProps {
  config: CaptchaConfig;
  // Changes after each submission (the form passes its action state). A token works once, so the widget asks for a
  // new one each time this changes.
  resetOn?: unknown;
}

// Turnstile and hCaptcha have the same small API: render into an element with a callback, reset, remove.
interface CaptchaApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

const PROVIDERS: Record<CaptchaProvider, { script: string; global: string }> = {
  turnstile: { script: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', global: 'turnstile' },
  hcaptcha: { script: 'https://js.hcaptcha.com/1/api.js?render=explicit', global: 'hcaptcha' },
};

function captchaApi(provider: CaptchaProvider): CaptchaApi | undefined {
  return (window as unknown as Record<string, CaptchaApi | undefined>)[PROVIDERS[provider].global];
}

// The CAPTCHA check on sign-up, sign-in and the reset request. It only exists when a site key is set (the page
// passes `config` as null otherwise and renders nothing here). Its token goes to the Server Action in a hidden
// field, which is written straight to the DOM: the form is submitted by the browser, so the value needs no state.
export function CaptchaWidget({ config, resetOn }: CaptchaWidgetProps) {
  const [ready, setReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const tokenField = useRef<HTMLInputElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !container.current) return;
    const api = captchaApi(config.provider);
    if (!api) return;
    const setToken = (token: string) => {
      if (tokenField.current) tokenField.current.value = token;
    };
    widgetId.current = api.render(container.current, {
      sitekey: config.siteKey,
      callback: setToken,
      'expired-callback': () => setToken(''),
      'error-callback': () => setToken(''),
    });
    return () => {
      if (widgetId.current !== null) api.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [ready, config.provider, config.siteKey]);

  useEffect(() => {
    if (widgetId.current === null) return;
    captchaApi(config.provider)?.reset(widgetId.current);
    if (tokenField.current) tokenField.current.value = '';
  }, [resetOn, config.provider]);

  return (
    <div>
      <Script src={PROVIDERS[config.provider].script} strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={container} />
      <input ref={tokenField} type="hidden" name={CAPTCHA_FIELD} defaultValue="" />
    </div>
  );
}
