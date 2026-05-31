export function NotificationBell({ unreadCount }) {
  return (
    <button type="button" aria-label="Notifications">
      Notifications ({unreadCount})
    </button>
  );
}
