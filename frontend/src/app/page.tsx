import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Culinary Blog</h1>
      <p className="max-w-md text-lg text-zinc-600">
        Khám phá, chia sẻ và quản lý công thức nấu ăn.
      </p>
      <Link
        href="/recipes"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:opacity-90"
      >
        Khám phá công thức
      </Link>
    </main>
  );
}
