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
  // Clear error styling on input
  authForm.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      if (authMessage && authMessage.classList.contains("error")) {
        authMessage.textContent = "";
        authMessage.classList.remove("error");
      }
    });
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const emailInput = authForm.querySelector('input[type="email"]');
    const passwordInput = authForm.querySelector('input[type="password"]');
    const nameInput = isRegistrationForm ? authForm.querySelector('input[name="name"]') : null;

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const name = nameInput ? nameInput.value.trim() : undefined;

    // Check for missing required fields
    if (!email || (passwordInput && !password) || (isRegistrationForm && !name)) {
      authMessage.textContent = "Please complete all required fields.";
      authMessage.classList.add("error");
      return;
    }

    // Format validation: email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      authMessage.textContent = "Please enter a valid email address.";
      authMessage.classList.add("error");
      return;
    }

    authMessage.classList.remove("error", "success", "warning");

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

    // Validate registration: check password length & match
    if (isRegistrationForm) {
      if (password.length < 8) {
        authMessage.textContent = "Password must be at least 8 characters.";
        authMessage.classList.add("error");
        return;
      }
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
          let errText = "Registration failed.";
          if (status === 422 && data.errors) {
            const firstKey = Object.keys(data.errors)[0];
            errText = data.errors[firstKey] ? data.errors[firstKey][0] : data.message;
          } else if (data.message) {
            errText = data.message;
          }
          authMessage.textContent = errText;
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
      const rawMsg = String(err && err.message ? err.message : "");
      let cleanMsg = "Unable to reach the server. Please check your network connection or try again later.";
      if (!/failed to fetch|network|load failed/i.test(rawMsg) && rawMsg) {
        cleanMsg = rawMsg;
      }
      authMessage.textContent = cleanMsg;
      authMessage.classList.add("error");
      restoreSubmit();
    }
  });

  // Mark the form so ../script.js does not attach a second submit handler
  // (duplicate handlers sent two requests per submit and could corrupt the
  // session when both raced, e.g. register -> 201 + 422/419).
  authForm.dataset.authBound = "1";
}

// Password reset workflow (forgot-password.html)
const forgotForm = document.querySelector("[data-forgot-form]");
const resetForm = document.querySelector("[data-reset-form]");
const showResetBtn = document.querySelector("[data-show-reset-step]");
const showForgotBtn = document.querySelector("[data-show-forgot-step]");

if (forgotForm && resetForm) {
  // Check URL parameters for direct reset links (e.g. from password-reset email)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramToken = urlParams.get("token");
    const paramEmail = urlParams.get("email");

    if (paramToken || paramEmail) {
      forgotForm.hidden = true;
      resetForm.hidden = false;
      if (paramEmail) {
        const emailInput = resetForm.querySelector('input[name="email"]');
        if (emailInput) emailInput.value = paramEmail;
      }
      if (paramToken) {
        const tokenInput = resetForm.querySelector('input[name="token"]');
        if (tokenInput) tokenInput.value = paramToken;
      }
      resetForm.querySelector('input[name="password"]')?.focus();

      // Prompt 9.2: Scrub sensitive reset credentials from the browser address bar immediately
      if (window.history && typeof window.history.replaceState === "function") {
        urlParams.delete("token");
        urlParams.delete("email");
        const remainingQuery = urlParams.toString();
        const cleanUrl = window.location.pathname + (remainingQuery ? "?" + remainingQuery : "") + window.location.hash;
        window.history.replaceState(null, document.title, cleanUrl);
      }
    }
  } catch (_) {
    // Graceful fallback if window.location or URLSearchParams is unavailable
  }

  if (showResetBtn) {
    showResetBtn.addEventListener("click", () => {
      forgotForm.hidden = true;
      resetForm.hidden = false;
      const emailVal = forgotForm.querySelector('input[type="email"]')?.value || "";
      if (emailVal) resetForm.querySelector('input[name="email"]').value = emailVal;
      resetForm.querySelector('input[name="token"]')?.focus();
    });
  }

  if (showForgotBtn) {
    showForgotBtn.addEventListener("click", () => {
      resetForm.hidden = true;
      forgotForm.hidden = false;
      forgotForm.querySelector('input[type="email"]')?.focus();
    });
  }

  const forgotMessage = forgotForm.querySelector("[data-forgot-message]");
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = forgotForm.querySelector('input[name="email"]');
    const email = emailInput ? emailInput.value.trim() : "";

    if (!email) {
      if (forgotMessage) {
        forgotMessage.textContent = "Please enter your account email.";
        forgotMessage.className = "auth-message error";
      }
      emailInput?.focus();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      if (forgotMessage) {
        forgotMessage.textContent = "Please enter a valid email address.";
        forgotMessage.className = "auth-message error";
      }
      emailInput?.focus();
      return;
    }

    const submitBtn = forgotForm.querySelector("[data-forgot-submit]");
    const originalText = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
    }
    if (forgotMessage) {
      forgotMessage.textContent = "Sending reset instructions…";
      forgotMessage.className = "auth-message";
    }

    try {
      const { data, status } = await window.SpendSenseAPI.post("/forgot-password", { email });
      if (status === 200 && data && data.success) {
        if (forgotMessage) {
          forgotMessage.textContent = data.message || "Reset instructions sent.";
          forgotMessage.className = "auth-message success";
        }
        setTimeout(() => {
          forgotForm.hidden = true;
          resetForm.hidden = false;
          resetForm.querySelector('input[name="email"]').value = email;
          if (data.debug_token) {
            resetForm.querySelector('input[name="token"]').value = data.debug_token;
          }
          resetForm.querySelector('input[name="password"]')?.focus();
        }, 1000);
      } else {
        if (forgotMessage) {
          forgotMessage.textContent = (data && data.message) || "Unable to send reset instructions. Please try again.";
          forgotMessage.className = "auth-message error";
        }
      }
    } catch (err) {
      if (forgotMessage) {
        forgotMessage.textContent = "Unable to reach the server. Please check your network connection.";
        forgotMessage.className = "auth-message error";
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText || "Send reset instructions";
      }
    }
  });

  const resetMessage = resetForm.querySelector("[data-reset-message]");
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = resetForm.querySelector('input[name="email"]');
    const tokenInput = resetForm.querySelector('input[name="token"]');
    const passwordInput = resetForm.querySelector('input[name="password"]');
    const confirmInput = resetForm.querySelector('input[name="password_confirmation"]');

    const email = emailInput ? emailInput.value.trim() : "";
    const token = tokenInput ? tokenInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const password_confirmation = confirmInput ? confirmInput.value : "";

    if (!email || !token || !password) {
      if (resetMessage) {
        resetMessage.textContent = "Please complete all required fields.";
        resetMessage.className = "auth-message error";
      }
      return;
    }

    if (password.length < 8) {
      if (resetMessage) {
        resetMessage.textContent = "Password must be at least 8 characters.";
        resetMessage.className = "auth-message error";
      }
      passwordInput?.focus();
      return;
    }

    if (password !== password_confirmation) {
      if (resetMessage) {
        resetMessage.textContent = "Passwords do not match.";
        resetMessage.className = "auth-message error";
      }
      confirmInput?.focus();
      return;
    }

    const submitBtn = resetForm.querySelector("[data-reset-submit]");
    const originalText = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Resetting…";
    }
    if (resetMessage) {
      resetMessage.textContent = "Updating password…";
      resetMessage.className = "auth-message";
    }

    try {
      const { data, status } = await window.SpendSenseAPI.post("/reset-password", {
        email,
        token,
        password,
        password_confirmation,
      });

      if (status === 200 && data && data.success) {
        if (resetMessage) {
          resetMessage.textContent = data.message || "Password reset successful! Redirecting to login…";
          resetMessage.className = "auth-message success";
        }
        setTimeout(() => {
          window.location.href = "login.html";
        }, 1200);
      } else {
        let errText = "Failed to reset password.";
        if (status === 422 && data && data.errors) {
          const firstKey = Object.keys(data.errors)[0];
          errText = data.errors[firstKey] ? data.errors[firstKey][0] : data.message;
        } else if (data && data.message) {
          errText = data.message;
        }
        if (resetMessage) {
          resetMessage.textContent = errText;
          resetMessage.className = "auth-message error";
        }
      }
    } catch (err) {
      if (resetMessage) {
        resetMessage.textContent = "Unable to reach the server. Please check your network connection.";
        resetMessage.className = "auth-message error";
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText || "Reset password";
      }
    }
  });
}
