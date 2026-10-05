(() => {
  'use strict';
  const db = window.RichRepublicSupabase;
  let pending = null;
  window.SobersAdminSecurity = Object.freeze({
    ensure() {
      if (pending) return pending;
      pending = verify().finally(() => { pending = null; });
      return pending;
    },
  });
  async function verify() {
    const { data: assurance, error } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (assurance.currentLevel === 'aal2') return;
    const dialog = document.createElement('dialog');
    dialog.innerHTML = '<form><h2>Protect your admin account</h2><p data-help>Use an authenticator app to verify your sign-in.</p><img data-qr alt="Authenticator setup QR code" hidden><p data-secret hidden></p><button type="button" data-setup>Set up authenticator</button><label>Six-digit code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><p data-message role="status"></p><button type="submit">Verify and continue</button><button type="button" data-signout>Sign out</button></form>';
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => event.preventDefault());
    const form = dialog.querySelector('form');
    const message = dialog.querySelector('[data-message]');
    const setup = dialog.querySelector('[data-setup]');
    const { data: factors, error: factorError } = await db.auth.mfa.listFactors();
    if (factorError) { dialog.remove(); throw factorError; }
    let factor = factors.totp?.find(f => f.status === 'verified');
    setup.hidden = Boolean(factor);
    form.querySelector('[type="submit"]').disabled = !factor;
    dialog.showModal();
    return new Promise((resolve, reject) => {
      const finish = () => { dialog.close(); dialog.remove(); };
      setup.onclick = async () => {
        setup.disabled = true;
        try {
          // Remove abandoned TOTP enrollments before creating a fresh one.
          for (const stale of factors.all || []) if (stale.factor_type === 'totp' && stale.status !== 'verified') {
            const { error } = await db.auth.mfa.unenroll({ factorId: stale.id }); if (error) throw error;
          }
          const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Sobers Admin' });
          if (error) throw error;
          factor = data;
          const qr = dialog.querySelector('[data-qr]');
          qr.src = data.totp.qr_code; qr.hidden = false;
          const secret = dialog.querySelector('[data-secret]');
          secret.textContent = `Manual setup key: ${data.totp.secret}`; secret.hidden = false;
          dialog.querySelector('[data-help]').textContent = 'Scan this code in your authenticator app, then enter its six-digit code. Keep the setup key private.';
          setup.hidden = true; form.querySelector('[type="submit"]').disabled = false;
        } catch (error) { message.textContent = error.message; setup.disabled = false; }
      };
      form.onsubmit = async event => {
        event.preventDefault(); if (!factor) return;
        const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
        try {
          const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code: form.elements.code.value });
          if (error) throw error;
          finish(); resolve();
        } catch (error) { message.textContent = error.message; form.elements.code.value = ''; submit.disabled = false; }
      };
      dialog.querySelector('[data-signout]').onclick = async () => { await db.auth.signOut(); finish(); reject(new Error('Signed out.')); };
    });
  }
})();
