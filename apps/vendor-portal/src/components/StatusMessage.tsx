interface Props {
  type: "error" | "success" | "info";
  title: string;
  message?: string;
}

export default function StatusMessage({ type, title, message }: Props) {
  const colors = {
    error:   "bg-red-50 border-red-200 text-red-800",
    success: "bg-green-50 border-green-200 text-green-800",
    info:    "bg-blue-50 border-blue-200 text-blue-800",
  };
  const icons = { error: "✕", success: "✓", info: "ℹ" };

  return (
    <div className={`min-h-screen flex items-center justify-center p-6`}>
      <div className={`max-w-md w-full rounded-xl border p-8 text-center ${colors[type]}`}>
        <div className="text-4xl mb-4">{icons[type]}</div>
        <h2 className="text-xl font-semibold mb-2">{title}</h2>
        {message && <p className="text-sm opacity-80">{message}</p>}
      </div>
    </div>
  );
}
