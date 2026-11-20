import Link from 'next/link';

export default function PieceNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Piece not found</h1>
      <p className="text-sm opacity-70">There is no piece at this address.</p>
      <Link href="/" className="text-sm underline">
        Back to the gallery
      </Link>
    </main>
  );
}
