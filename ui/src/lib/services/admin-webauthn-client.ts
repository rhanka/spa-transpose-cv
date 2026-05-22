import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export function isAdminWebAuthnSupported(): boolean {
  return typeof window !== 'undefined'
    && 'PublicKeyCredential' in window
    && typeof window.PublicKeyCredential === 'function';
}

export async function startAdminPasskeyRegistration(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  if (!isAdminWebAuthnSupported()) {
    throw new Error('passkey_not_supported');
  }

  return startRegistration({ optionsJSON: options });
}

export async function startAdminPasskeyAuthentication(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  if (!isAdminWebAuthnSupported()) {
    throw new Error('passkey_not_supported');
  }

  return startAuthentication({ optionsJSON: options });
}

export function getAdminWebAuthnErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : undefined;
  const message = error instanceof Error ? error.message : String(error);

  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'Opération passkey annulée.';
  }
  if (name === 'InvalidStateError') {
    return 'Cette passkey est déjà enregistrée ou indisponible.';
  }
  if (name === 'NotSupportedError' || message === 'passkey_not_supported') {
    return 'Passkeys non supportées par ce navigateur.';
  }

  return message || 'Opération passkey impossible.';
}
