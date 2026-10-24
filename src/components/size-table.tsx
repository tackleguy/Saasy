// Placeholder measurements — replace with approved size chart.
const rows = [
  ["XS", '32–34"', '26–28"'],
  ["S", '35–37"', '29–31"'],
  ["M", '38–40"', '32–34"'],
  ["L", '41–43"', '35–37"'],
  ["XL", '44–46"', '38–40"'],
  ["XXL", '47–49"', '41–43"'],
];

export function SizeTable() {
  return (
    <div>
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b"><th className="py-2">Size</th><th>Chest</th><th>Waist</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r[0]} className="border-b">{r.map((c) => <td key={c} className="py-2">{c}</td>)}</tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs">Placeholder measurements. Oversized fits run roomy — size down for a closer fit.</p>
    </div>
  );
}
