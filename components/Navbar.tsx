'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import { clsx } from 'clsx';
import { isAdminEmail } from '@/lib/config/admins';

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useUser();

  const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? '';
  const isAdmin = isAdminEmail(userEmail);

  const navLinks = [
    { href: '/dashboard', label: 'New Search' },
    { href: '/dashboard/history', label: 'History' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <header className="border-b border-[#1e293b] bg-[#0d1424] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
          <Image src="/priovex-logo.png" alt="PrioVex" width={110} height={28} className="object-contain" />
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                pathname === link.href
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-400 hover:text-white hover:bg-[#1e293b]'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* User Button */}
        <div className="flex-shrink-0">
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-8 h-8',
                userButtonPopoverCard: 'bg-[#111827] border border-[#1e293b]',
                userButtonPopoverActionButton: 'text-slate-300 hover:bg-[#1e293b]',
                userButtonPopoverActionButtonText: 'text-slate-300',
                userButtonPopoverFooter: 'hidden',
              },
            }}
            afterSignOutUrl="/"
          />
        </div>
      </div>
    </header>
  );
}
