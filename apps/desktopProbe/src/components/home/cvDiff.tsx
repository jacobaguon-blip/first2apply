type DiffLine = { kind: 'eq' | 'add' | 'del'; text: string };

export function DiffView({
  lines,
  stats,
  hasMaster,
}: {
  lines: DiffLine[];
  stats: { added: number; removed: number };
  hasMaster: boolean;
}) {
  if (!hasMaster) {
    return (
      <p className="text-sm text-muted-foreground">
        Upload a master CV in <strong>My CV</strong> to see what changed.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-green-600">+{stats.added}</span> added
        </span>
        <span>
          <span className="font-medium text-red-600">-{stats.removed}</span> removed
        </span>
      </div>
      <pre className="overflow-x-auto rounded-md border font-mono text-xs">
        {lines.map((ln, i) => {
          const base = 'block px-3 py-0.5 whitespace-pre-wrap break-words';
          if (ln.kind === 'add')
            return (
              <span key={i} className={`${base} bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-200`}>
                + {ln.text || ' '}
              </span>
            );
          if (ln.kind === 'del')
            return (
              <span
                key={i}
                className={`${base} bg-red-50 text-red-900 line-through dark:bg-red-950/40 dark:text-red-200`}
              >
                - {ln.text || ' '}
              </span>
            );
          return (
            <span key={i} className={`${base} text-muted-foreground`}>
              &nbsp;&nbsp;{ln.text || ' '}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

/**
 * Minimal LCS-based line diff. O(n*m) memory — fine for ~few-hundred-line CVs.
 * Returns an in-order array of equal / added / deleted lines suitable for a
 * single-pane diff view.
 */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ kind: 'eq', text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: A[i] });
      i++;
    } else {
      out.push({ kind: 'add', text: B[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'del', text: A[i++] });
  while (j < m) out.push({ kind: 'add', text: B[j++] });
  return out;
}
