'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { BriefcaseIcon, BuildingIcon, LogoutIcon, UsersIcon } from './Icons';
import { classNames } from '@/lib/format';

const TABS = [
  { href: '/jobs', label: 'Jobs', icon: BriefcaseIcon },
  { href: '/people', label: 'People', icon: UsersIcon },
  { href: '/companies', label: 'Companies', icon: BuildingIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-14 flex-col items-center justify-between border-r border-slate-200 bg-white py-3">
        <div className="flex flex-col items-center gap-4">
          <Link
            href="/jobs"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-sm font-bold text-white"
          >
            J
          </Link>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                title={tab.label}
                className={classNames(
                  'flex h-9 w-9 items-center justify-center rounded-md',
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-400 hover:bg-slate-100',
                )}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={logout}
          title={`Sign out (${user.email})`}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"
        >
          <LogoutIcon className="h-5 w-5" />
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4">
          <nav className="flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={classNames(
                    'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium',
                    active
                      ? 'border-brand-700 text-brand-800'
                      : 'border-transparent text-slate-500 hover:text-slate-800',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <span className="hidden text-sm text-slate-500 sm:block">{user.name}</span>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
