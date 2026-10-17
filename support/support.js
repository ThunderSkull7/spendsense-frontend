const contactForm = document.querySelector("[data-contact-form]");
const supportMessage = document.querySelector("[data-support-message]");

contactForm.addEventListener("submit", (event) => {
  event.preventDefault();
  // SUPPORT IS CURRENTLY LIMITED TO BROWSER-BASED HELP ONLY
  supportMessage.textContent =
    "Support requests can't be sent from the app yet — nothing was sent. Support is currently limited to browser-based help only.";
});
