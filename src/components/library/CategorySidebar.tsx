import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useLibraryStore } from '@/stores/library'
import type { CategoryNode } from '@shared/ipc-contract'
import { cn } from '@/lib/utils'

function isInboxActive(pathPrefix: string | undefined): boolean {
  return pathPrefix === 'inbox/'
}
function isUnreviewedActive(rating: { min?: number; max?: number } | undefined): boolean {
  return rating?.min === 0 && rating?.max === 0
}
function isAllActive(filter: ReturnType<typeof useLibraryStore.getState>['filter']): boolean {
  return !filter.pathPrefix && !filter.category && !filter.tag && !filter.rating && !filter.q
}

function ViewButton(props: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  dot?: boolean
  indent?: number
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'mx-2 my-px flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-left text-[13px]',
        props.active
          ? 'border-[color:var(--color-line-2)] bg-[color:var(--color-paper)] text-[color:var(--color-ink)]'
          : 'text-[color:var(--color-ink-2)]'
      )}
      style={{ paddingLeft: 10 + (props.indent ?? 0) * 12 }}
    >
      {props.dot ? (
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[color:var(--color-acorn)]" />
      ) : null}
      <span className="flex-1 truncate">{props.label}</span>
      {props.count !== undefined ? (
        <span className="font-mono text-[11px] text-[color:var(--color-ink-4)]">{props.count}</span>
      ) : null}
    </button>
  )
}

function CategoryBranch({ node, depth }: { node: CategoryNode; depth: number }): JSX.Element {
  const filter = useLibraryStore((s) => s.filter)
  const setFilter = useLibraryStore((s) => s.setFilter)
  const active = filter.category === node.name
  return (
    <>
      <ViewButton
        label={node.name}
        count={node.count}
        active={active}
        indent={depth}
        onClick={() =>
          setFilter({
            category: active ? undefined : node.name,
            pathPrefix: undefined,
            tag: undefined,
            rating: undefined
          })
        }
      />
      {depth < 1 &&
        node.children.map((c) => (
          <CategoryBranch key={c.name} node={c} depth={depth + 1} />
        ))}
    </>
  )
}

function fontSizeForUsage(count: number, max: number): number {
  if (max <= 1) return 12
  const t = Math.min(1, Math.max(0, (count - 1) / (max - 1)))
  return Math.round(11 + t * 2)
}

export function CategorySidebar(): JSX.Element {
  const { t } = useTranslation()
  const filter = useLibraryStore((s) => s.filter)
  const tree = useLibraryStore((s) => s.categoryTree)
  const cloud = useLibraryStore((s) => s.tagCloud)
  const setFilter = useLibraryStore((s) => s.setFilter)
  const totalAll = useLibraryStore((s) => s.total)

  const allActive = isAllActive(filter)
  const inboxActive = isInboxActive(filter.pathPrefix)
  const unreviewedActive = isUnreviewedActive(filter.rating)
  const maxUsage = cloud.reduce((m, t) => Math.max(m, t.usage_count), 0)

  return (
    <aside
      className="flex w-[200px] flex-shrink-0 flex-col overflow-y-auto border-r-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper-2)] py-3.5"
      data-testid="library-category-sidebar"
    >
      <SectionLabel>{t('library.views')}</SectionLabel>
      <ViewButton
        label={t('library.all')}
        count={totalAll}
        active={allActive}
        onClick={() =>
          setFilter({ pathPrefix: undefined, category: undefined, tag: undefined, rating: undefined })
        }
      />
      <ViewButton
        label={t('library.inbox')}
        active={inboxActive}
        onClick={() =>
          setFilter({ pathPrefix: 'inbox/', category: undefined, tag: undefined, rating: undefined })
        }
      />
      <ViewButton
        label={t('library.unreviewed')}
        active={unreviewedActive}
        dot
        onClick={() =>
          setFilter({ rating: { min: 0, max: 0 }, pathPrefix: undefined, category: undefined, tag: undefined })
        }
      />

      {tree.length > 0 ? (
        <>
          <SectionLabel>{t('library.categories')}</SectionLabel>
          {tree.map((n) => (
            <CategoryBranch key={n.name} node={n} depth={0} />
          ))}
        </>
      ) : null}

      {cloud.length > 0 ? (
        <>
          <SectionLabel>{t('library.tags')}</SectionLabel>
          <div className="flex flex-wrap gap-1 px-3 pb-3">
            {cloud.map((tag) => (
              <button
                type="button"
                key={tag.name}
                onClick={() =>
                  setFilter({ tag: tag.name, pathPrefix: undefined, category: undefined, rating: undefined })
                }
                className={cn(
                  'rounded-full border-[0.5px] border-[color:var(--color-line)] bg-[color:var(--color-paper-3)] px-2 py-0.5 font-mono text-[color:var(--color-ink-3)]',
                  filter.tag === tag.name && 'bg-[color:var(--color-acorn-bg)] text-[color:var(--color-ink)]'
                )}
                style={{ fontSize: fontSizeForUsage(tag.usage_count, maxUsage) }}
              >
                #{tag.name}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="px-3.5 pb-1.5 pt-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-4)]">
      {children}
    </div>
  )
}
