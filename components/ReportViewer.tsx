'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ReportViewerProps {
  patentabilityMd: string;
  clientReportMd: string;
  searchId: string;
}

type TabType = 'patentability' | 'client';

export default function ReportViewer({
  patentabilityMd,
  clientReportMd,
  searchId,
}: ReportViewerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('patentability');

  const tabs: { id: TabType; label: string; description: string }[] = [
    {
      id: 'patentability',
      label: 'Patentability Report',
      description: 'Full prior art analysis with comparison tables and observations',
    },
    {
      id: 'client',
      label: 'Client Report',
      description: 'Client-ready supplementary search report with claim strategy',
    },
  ];

  const currentContent = activeTab === 'patentability' ? patentabilityMd : clientReportMd;

  return (
    <div className="bg-[#111827] border border-[#1e293b] rounded-2xl overflow-hidden">
      {/* Tab Header */}
      <div className="border-b border-[#1e293b] px-6 pt-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px ${
                activeTab === tab.id
                  ? 'bg-[#0a0f1e] border border-[#1e293b] border-b-[#0a0f1e] text-white'
                  : 'text-slate-400 hover:text-white hover:bg-[#1e293b] rounded-lg'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Description */}
      <div className="px-6 py-3 bg-[#0d1424] border-b border-[#1e293b] flex items-center justify-between">
        <p className="text-slate-400 text-sm">
          {tabs.find((t) => t.id === activeTab)?.description}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Download PDF
          </button>
          <a
            href={`/api/reports/${searchId}/download?type=${activeTab}`}
            download
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download .md
          </a>
        </div>
      </div>

      {/* Report Content */}
      <div className="p-6 md:p-8 overflow-x-auto">
        <div className="markdown-content max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="bg-[#1e293b] text-white px-4 py-3 text-left text-sm font-semibold border border-[#334155]">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-4 py-2.5 text-sm border border-[#1e293b] text-slate-300 align-top">
                  {children}
                </td>
              ),
              tr: ({ children, ...props }) => (
                <tr className="even:bg-[#0d1424]" {...props}>
                  {children}
                </tr>
              ),
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-white mt-8 mb-4 pb-3 border-b border-[#1e293b] first:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-slate-100 mt-8 mb-3">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-base font-semibold text-slate-200 mt-6 mb-2">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-slate-300 leading-relaxed mb-3 text-sm">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-outside pl-5 mb-3 space-y-1">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-outside pl-5 mb-3 space-y-1">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-slate-300 text-sm leading-relaxed">
                  {children}
                </li>
              ),
              code: ({ children, className }) => {
                const isBlock = className?.includes('language-');
                return isBlock ? (
                  <code className="block bg-[#1e293b] rounded-lg p-4 text-sm text-blue-200 overflow-x-auto font-mono whitespace-pre-wrap">
                    {children}
                  </code>
                ) : (
                  <code className="bg-[#1e293b] text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono">
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => (
                <pre className="bg-[#1e293b] border border-[#334155] rounded-xl overflow-x-auto mb-4 p-4">
                  {children}
                </pre>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-blue-600 pl-4 py-1 my-4 text-slate-400 italic">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="border-[#1e293b] my-6" />,
              strong: ({ children }) => (
                <strong className="font-semibold text-slate-100">{children}</strong>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                >
                  {children}
                </a>
              ),
            }}
          >
            {currentContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
