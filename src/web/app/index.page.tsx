import { createFileRoute } from '@tanstack/react-router';

const Dashboard = () => {
  return (
    <div>
      <h1>Symphony Dashboard</h1>
    </div>
  );
};

export const Route = createFileRoute('/')({
  component: Dashboard,
});
