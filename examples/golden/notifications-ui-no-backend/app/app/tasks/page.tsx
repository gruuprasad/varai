import { NotificationBell } from "../../components/NotificationBell";

export default function TasksPage() {
  return (
    <main>
      <NotificationBell unreadCount={3} />
      <h1>Tasks</h1>
    </main>
  );
}
