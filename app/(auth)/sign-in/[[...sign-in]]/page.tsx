import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold">IP</span>
            </div>
            <span className="font-bold text-2xl text-white tracking-tight">Priora.AI</span>
          </div>
          <p className="text-slate-400 text-sm">Sign in to access your patent searches</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'bg-[#111827] border border-[#1e293b] shadow-2xl rounded-2xl',
              headerTitle: 'text-white',
              headerSubtitle: 'text-slate-400',
              socialButtonsBlockButton:
                'bg-[#1e293b] border-[#334155] text-white hover:bg-[#334155]',
              dividerLine: 'bg-[#1e293b]',
              dividerText: 'text-slate-500',
              formFieldLabel: 'text-slate-300',
              formFieldInput:
                'bg-[#0a0f1e] border-[#1e293b] text-white placeholder-slate-500 focus:border-blue-500',
              formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
              footerActionLink: 'text-blue-400 hover:text-blue-300',
              identityPreviewText: 'text-white',
              identityPreviewEditButton: 'text-blue-400',
            },
          }}
        />
      </div>
    </div>
  );
}
