export default function TasksPage() {
  return (
    <main>
      <h1>Tasks</h1>
      <form>
        <input name="title" aria-label="Task title" />
        <button type="submit">Create task</button>
      </form>
    </main>
  );
}
