import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ApiStatusIndicator } from "@/components/shell/ApiStatusIndicator";

const githubLinks = [
  {
    label: "DM Dashboard Repo",
    href: "https://github.com/your-user/septagon-dm-dashboard-web"
  },
  {
    label: "Septagon Repo",
    href: "https://github.com/your-user/Septagon"
  },
  {
    label: "DnData Repo",
    href: "https://github.com/your-user/DnData"
  }
];

export function AppFooter() {
  return (
    <footer className="sticky bottom-0 z-20 flex h-[56px] items-center border-t-2 border-crt-border bg-crt-bg/95 px-6 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-crt-muted">
          {githubLinks.map((link) => (
            <a
              className="inline-flex items-center gap-1.5 transition hover:text-crt-text"
              href={link.href}
              key={link.label}
              rel="noreferrer"
              target="_blank"
            >
              <FontAwesomeIcon className="text-[11px]" fixedWidth icon={faGithub} />
              {link.label}
            </a>
          ))}
        </div>
        <div className="shrink-0">
          <ApiStatusIndicator />
        </div>
      </div>
    </footer>
  );
}
