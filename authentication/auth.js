// SpendSense authentication page script (login / signup / forgot password).
// Relies on ../script.js (window.SpendSenseAPI) loaded earlier: it provides
// the Sanctum cookie-based API client with automatic XSRF-TOKEN handling and
// the central password show/hide behaviour for [data-toggle-password] buttons.
const authForm = document.querySelector("[data-auth-form]");
const authMessage = document.querySelector("[data-auth-message]");

// Detect if form has a name field (registration form) or just email/password (login form).
// If a name field exists, treat as registration; otherwise login.
const isRegistrationForm = authForm && authForm.querySelector('input[name="name"]');

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!authForm.checkValidity()) {
      authMessage.textContent = "Please complete the required fields.";
      authMessage.classList.add("error");
      return;
    }

    authMessage.classList.remove("error", "success");

    const emailInput = authForm.querySelector('input[type="email"]');
    const passwordInput = authForm.querySelector('input[type="password"]');
    const nameInput = isRegistrationForm ? authForm.querySelector('input[name="name"]') : null;

    // Pages without a password field (e.g. forgot-password) only validate the
    // email client-side and show the confirmation configured on the form.
    if (!passwordInput) {
      // PASSWORD RESET IS NOT YET SUPPORTED
      if (authForm.dataset.success) {
        authMessage.textContent = authForm.dataset.success;
        authMessage.classList.add("warning");
      } else {
        authMessage.textContent =
          "Password reset is not yet available. Contact support if you need assistance.";
        authMessage.classList.add("warning");
      }
      return;
    }

    const email = emailInput.value;
    const password = passwordInput.value;
    const name = nameInput ? nameInput.value : undefined;

    // Validate registration: check password match when a confirmation field exists.
    if (isRegistrationForm) {
      const confirmInput = authForm.querySelector('input[name="password_confirmation"]');
      if (confirmInput && confirmInput.value !== password) {
        authMessage.textContent = "Passwords do not match.";
        authMessage.classList.add("error");
        return;
      }
    }

    // Block duplicate clicks while the request is in flight; the button is
    // restored on failures (success paths navigate away shortly after).
    const submitButton = authForm.querySelector('button[type="submit"]');
    const submitLabel = submitButton ? submitButton.textContent : "";
    const restoreSubmit = () => {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
    };
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = isRegistrationForm ? "Creating account…" : "Signing in…";
    }

    try {
      if (isRegistrationForm) {
        if (!window.SpendSenseAPI) throw new Error("API client not loaded.");

        const confirmInput = authForm.querySelector('input[name="password_confirmation"]');

        const { data, status } = await window.SpendSenseAPI.post("/register", {
          name,
          email,
          password,
          password_confirmation: confirmInput ? confirmInput.value : password,
        });

        if (status === 201) {
          authMessage.classList.add("success");
          authMessage.textContent = data.message || "Account created!";
          window.SpendSenseAPI.user = data.user;
          if (window.refreshStats) window.refreshStats();

          // Registration establishes the session server-side, so continue to
          // the dashboard like a successful login.
          setTimeout(() => {
            window.location.href = "../dashboard/dashboard.html";
          }, 1000);
        } else {
          authMessage.textContent =
            data.message ||
            (data.errors && data.errors.email ? data.errors.email[0] : "Registration failed.");
          authMessage.classList.add("error");
          restoreSubmit();
        }
      } else {
        const result = await window.auth.login(email, password);

        if (result.success) {
          authMessage.classList.add("success");
          authMessage.textContent = "Welcome back!";
          window.SpendSenseAPI.user = result.user;
          if (window.refreshStats) window.refreshStats();

          setTimeout(() => {
            window.location.href = "../dashboard/dashboard.html";
          }, 800);
        } else {
          authMessage.textContent = result.message || "Invalid email or password.";
          authMessage.classList.add("error");
          restoreSubmit();
        }
      }
    } catch (err) {
      authMessage.textContent = "Something went wrong. " + (err.message || "");
      authMessage.classList.add("error");
      restoreSubmit();
    }
  });

  // Mark the form so ../script.js does not attach a second submit handler
  // (duplicate handlers sent two requests per submit and could corrupt the
  // session when both raced, e.g. register -> 201 + 422/419).
  authForm.dataset.authBound = "1";
}
