/** Minimal glob matcher supporting `*`, `**`, `?` and `{a,b}` — used for permission rules. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (glob[i] === "/") i++;
        continue;
      }
      re += "[^/]*";
      i++;
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      i++;
      continue;
    }
    if (ch === "{") {
      const end = glob.indexOf("}", i);
      if (end > i) {
        const options = glob.slice(i + 1, end).split(",").map(escapeRegExp);
        re += `(?:${options.join("|")})`;
        i = end + 1;
        continue;
      }
    }
    re += escapeRegExp(ch);
    i++;
  }
  return new RegExp(`^${re}$`);
}

export function matchGlob(glob: string, value: string): boolean {
  return globToRegExp(glob).test(value.split("\\").join("/"));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
