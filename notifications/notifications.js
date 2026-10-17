// Notifications page — honest states only.
// The backend does not implement notifications or reminder preferences yet,
// so this file must never claim that anything was saved.
const markReadButton = document.querySelector("[data-mark-read]");
const reminderForm = document.querySelector("[data-reminder-form]");
const notificationMessage = document.querySelector("[data-notification-message]");

const setNotificationMessage = (text) => {
  if (!notificationMessage) return;
  notificationMessage.textContent = text || "";
};

if (markReadButton) {
  markReadButton.addEventListener("click", () => {
    const notifications = document.querySelectorAll("[data-notification-list] article");
    if (!notifications.length) {
      setNotificationMessage("Notifications aren't supported yet, so there is nothing to mark as read.");
      return;
    }
    notifications.forEach((notification) => notification.classList.add("read"));
    markReadButton.textContent = "All Read";
  });
}

if (reminderForm) {
  reminderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    // No supported API exists to persist reminder preferences.
    setNotificationMessage("Reminder preferences can't be saved yet — this isn't supported, so nothing was saved.");
  });
}
