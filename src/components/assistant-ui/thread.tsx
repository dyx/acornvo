
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/reasoning";


import { ContextDisplay } from "./context-display";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  TextMessagePartProvider,
} from "@assistant-ui/react";
import { ComposerTriggerPopover } from "@/components/assistant-ui/composer-trigger-popover";
import { useFileMentionAdapter, useFileMentionStore } from "@/components/assistant-ui/file-mention-adapter";
import { File } from "@/components/assistant-ui/file";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";

import { useChatStore } from "@/stores/chat";
import { useProvidersStore } from "@/stores/providers";
import { useSettingsStore } from "@/stores/settings";
import { ToolStepsChain, MessageFooter } from "@/components/chat/MessageAddons";

import { ScrollToBottomButton } from "@/components/chat/ScrollToBottomButton";
import { useRef } from "react";

export const Thread: FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <ThreadPrimitive.Root
      className="font-chat aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-radius" as string]: "24px",
        ["--composer-padding" as string]: "10px",
      }}
    >
      <ThreadPrimitive.Viewport
        ref={viewportRef}
        turnAnchor="bottom"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll"
      >
        <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4">
          {/* Top boundary blur */}
          <div className="pointer-events-none sticky top-0 z-10 h-4 -mx-4 px-4 bg-gradient-to-b from-background to-transparent" />

          <div className="pt-2">
            <AuiIf condition={(s) => s.thread.isEmpty}>
              <ThreadWelcome />
            </AuiIf>
          </div>

          <div
            data-slot="aui_message-group"
            className="pb-10 flex flex-col gap-y-8 empty:hidden"
          >
            <ThreadPrimitive.Messages
              components={{
                UserMessage: UserMessage,
                AssistantMessage: AssistantMessage,
                EditComposer: EditComposer,
              }}
            />
          </div>
        </div>
      </ThreadPrimitive.Viewport>

      <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-col px-4 bg-background pt-4 pb-2 relative mt-auto">
        <div className="pointer-events-none absolute inset-x-0 -top-4 h-4 bg-gradient-to-t from-background to-transparent" />
        <ScrollToBottomButton 
          containerRef={viewportRef} 
          threshold={300}
          className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full border border-border/50 text-muted-foreground/70 bg-background/80 backdrop-blur-sm hover:bg-muted/80 hover:text-foreground shadow-sm size-8 transition-all flex items-center justify-center"
        />
        <Composer />
      </div>
    </ThreadPrimitive.Root>
  );
};



import { EmptyState } from "@/pages/Chat";

const ThreadWelcome: FC = () => {
  return <EmptyState />;
};




const Composer: FC = () => {
  const fileMention = useFileMentionAdapter();
  const mentionedFiles = useFileMentionStore(s => s.files);
  const removeFile = useFileMentionStore(s => s.removeFile);
  const addFile = useFileMentionStore(s => s.addFile);
  const { toast } = useToast();
  const { t } = useTranslation();

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
        <div
          data-slot="aui_composer-shell"
          className="bg-background focus-within:border-ring/75 focus-within:ring-ring/20 flex w-full flex-col gap-2 rounded-(--composer-radius) border p-(--composer-padding) transition-shadow focus-within:ring-2"
        >
          <div className="flex flex-wrap gap-2 px-1 empty:hidden pb-1">
            {mentionedFiles.map(att => (
              <div key={att.path} className="relative group">
                <File 
                  filename={att.title || att.path.split('/').pop()} 
                  mimeType="text/plain" 
                  data="" 
                  type="file"
                  status={{ type: 'complete' } as any}
                />
                <button
                  type="button"
                  className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeFile(att.path)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
          <ComposerPrimitive.Input
            placeholder={t("chat.input.placeholder", "Type a message... (Type @ to mention files, Cmd+Enter to send)")}
            className="aui-composer-input placeholder:text-muted-foreground/80 max-h-64 w-full resize-none bg-transparent px-1.75 py-1 text-base outline-none"
            rows={1}
            autoFocus
            aria-label="Message input"
          />
          <ComposerTriggerPopover
            char="@"
            {...fileMention}
            action={{
              onExecute: (item) => {
                if (item.metadata?.fileInfo) {
                  addFile(item.metadata.fileInfo as any, toast);
                }
              },
              removeOnExecute: true
            }}
          />
          <ComposerAction />
        </div>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};

const ComposerAction: FC = () => {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const currentSession = useChatStore((s) => s.sessions.find(ses => ses.id === activeSessionId));
  const models = useProvidersStore((s) => s.models);
  const defaultChatModelId = useSettingsStore((s) => s.ai.defaultChatModelId);

  const lastAssistantMessage = useChatStore((s) => {
    if (!activeSessionId) return null;
    const messages = s.bySession[activeSessionId]?.messages || [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i];
    }
    return null;
  });

  const profileId = currentSession?.profileId || defaultChatModelId;
  const activeModel = models.find(m => m.id === profileId);
  const modelContextWindow = activeModel?.contextWindow || 128000;

  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between mt-1">
      <div className="flex items-center gap-2">
      </div>
      <div className="flex items-center gap-1">
        <ContextDisplay.Ring modelContextWindow={modelContextWindow} usage={lastAssistantMessage?.usage as any} />
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton
              tooltip="Send message"
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-8 rounded-full"
              aria-label="Send message"
            >
              <ArrowUpIcon className="aui-composer-send-icon size-4" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-8 rounded-full"
              aria-label="Stop generating"
            >
              <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};


const AssistantMessage: FC = () => {
  // reserves space for action bar and compensates with `-mb` for consistent msg spacing
  // keeps hovered action bar from shifting layout (autohide doesn't support absolute positioning well)
  // for pt-[n] use -mb-[n + 6] & min-h-[n + 6] to preserve compensation
  // removed unused action bar constants

  const parts = useAuiState((s) => s.message.parts);
  const content = useAuiState((s) => s.message.content) as any[];
  const messageId = useAuiState((s) => s.message.id);
  const originalMessage = useChatStore((s) => s.activeSessionId ? s.bySession[s.activeSessionId]?.messages.find(m => String(m.id) === messageId) : null);
  const isRunning = useAuiState((s) => s.message.status?.type === "running");

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        // [contain-intrinsic-size:auto_24px] fixes issue #4104, don't change without checking for regressions
        className={cn(
          "text-foreground px-2 leading-relaxed wrap-break-word",
          !isRunning && "[contain-intrinsic-size:auto_24px] [content-visibility:auto]"
        )}
      >
        <MessagePrimitive.GroupedParts
          groupBy={(part) => {
            if (part.type === "reasoning") return ["group-chainOfThought", "group-reasoning"];
            if (part.type === "tool-call") return ["group-chainOfThought", "group-tool"];
            if (part.type === "text") {
              const index = parts.indexOf(part);
              if (index === -1) return [];
              const hasToolCallAfter = parts.slice(index + 1).some((p: any) => p.type === "tool-call");
              const hasReasoningAfter = parts.slice(index + 1).some((p: any) => p.type === "reasoning");
              if (hasToolCallAfter || hasReasoningAfter) return ["group-chainOfThought", "group-text"];
              return [];
            }
            return [];
          }}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought": {
                const running = part.status.type === "running";
                const reasoningContent = content?.find((c: any) => c.type === 'reasoning');
                const duration = reasoningContent?.duration || originalMessage?.reasoningDuration;
                
                return (
                  <ReasoningRoot defaultOpen={running} className="mb-2 w-full ml-1" variant="ghost">
                    <ReasoningTrigger active={running} duration={duration} />
                    <ReasoningContent aria-busy={running} className="relative mt-3">
                      <div className="flex flex-col">
                        {children}
                      </div>
                      <AssistantMessageAddons />
                    </ReasoningContent>
                  </ReasoningRoot>
                );
              }
              case "group-reasoning":
                return (
                  <div className="relative pb-2 pl-8 group/item">
                    {/* Timeline vertical line */}
                    <div className="absolute left-[7.5px] top-[33px] bottom-[-3px] w-[1px] bg-border/60" />
                    {/* Timeline dot */}
                    <div className="absolute left-[5px] top-[15px] w-1.5 h-1.5 rounded-full bg-muted-foreground/70 ring-[6px] ring-background z-10" />
                    <ReasoningText className="text-muted-foreground">{children}</ReasoningText>
                  </div>
                );
              case "group-text":
                return (
                  <div className="relative pb-2 pl-8 group/item">
                    {/* Timeline vertical line */}
                    <div className="absolute left-[7.5px] top-[33px] bottom-[-3px] w-[1px] bg-border/60" />
                    {/* Timeline dot */}
                    <div className="absolute left-[5px] top-[15px] w-1.5 h-1.5 rounded-full bg-muted-foreground/70 ring-[6px] ring-background z-10" />
                    <div className="text-muted-foreground opacity-80 pt-2">{children}</div>
                  </div>
                );
              case "group-tool":
                return (
                  <div className="relative pb-2 pl-8 flex flex-col gap-2 group/item">
                    {/* Timeline vertical line */}
                    <div className="absolute left-[7.5px] top-[33px] bottom-[-3px] w-[1px] bg-border/60" />
                    {/* Timeline dot */}
                    <div className="absolute left-[5px] top-[15px] w-1.5 h-1.5 rounded-full bg-muted-foreground/70 ring-[6px] ring-background z-10" />
                    <div className="pt-2 flex flex-col gap-2">{children}</div>
                  </div>
                );
              case "text":
                return (
                  <TextMessagePartProvider text={part.text || ""} isRunning={part.status?.type === "running"}>
                    <MarkdownText />
                  </TextMessagePartProvider>
                );
              case "reasoning":
                return <Reasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallback {...part} />;
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
      </div>

      <AssistantMessageFooter />
    </MessagePrimitive.Root>
  );
};

const AssistantMessageFooter: FC = () => {
  const ACTION_BAR_PT = "pt-1.5";
  const ACTION_BAR_HEIGHT = `-mb-7.5 min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <div
      data-slot="aui_assistant-message-footer"
      className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
    >
      <BranchPicker />
      <AssistantActionBar />
    </div>
  );
};

const AssistantMessageAddons: FC = () => {
  const messageId = useAuiState((s) => s.message.id);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const storeMsg = useChatStore((s) => 
    activeSessionId ? s.bySession[activeSessionId]?.messages.find(m => m.id === messageId) : null
  ) as any;
  
  if (!storeMsg || !storeMsg.toolSteps || storeMsg.toolSteps.length === 0) return null;
  
  return (
    <div className="px-2 pb-2">
      <ToolStepsChain steps={storeMsg.toolSteps} />
    </div>
  );
};

const AssistantActionBar: FC = () => {
  const { t } = useTranslation();
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground col-start-3 row-start-2 -ms-1 flex gap-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <Button variant="ghost" size="icon" className="aui-button-icon size-6 p-1">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </Button>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <Button variant="ghost" size="icon" className="aui-button-icon size-6 p-1">
          <RefreshCwIcon />
        </Button>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <Button variant="ghost" size="icon" className="aui-button-icon size-6 p-1 data-[state=open]:bg-accent">
            <MoreHorizontalIcon />
          </Button>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          className="aui-action-bar-more-content bg-popover text-popover-foreground z-50 min-w-32 overflow-hidden rounded-md border p-1 shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none">
              <DownloadIcon className="size-4" />
              {t("chat.message.exportMarkdown", "Export as Markdown")}
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};


const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_60px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0 flex flex-col gap-2 items-end">
        <MessagePrimitive.GroupedParts groupBy={part => part.type === "file" ? ["group-file"] : ["group-content"]}>
          {({ part, children }) => {
            if (part.type === "group-file") {
              return <div className="flex flex-col gap-2 w-full items-end">{children}</div>;
            }
            if (part.type === "group-content") {
              return (
                <div className="aui-user-message-content peer bg-muted text-foreground rounded-2xl px-4 py-2.5 wrap-break-word empty:hidden">
                  {children}
                </div>
              );
            }
            if (part.type === "file") {
              const p = part as any;
              const name = p.file?.name || p.name || p.filename;
              return <File {...part} filename={name} />;
            }
            if (part.type === "text") {
              return (
                <TextMessagePartProvider text={part.text || ""} isRunning={part.status?.type === "running"}>
                  <MarkdownText />
                </TextMessagePartProvider>
              );
            }
            return null;
          }}
        </MessagePrimitive.GroupedParts>

        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
      <div className="col-start-2 mt-1">
        <UserMessageFooterWrapper />
      </div>
    </MessagePrimitive.Root>
  );
};

const UserMessageFooterWrapper: FC = () => {
  const messageId = useAuiState((s) => s.message.id);
  return <MessageFooter messageId={messageId} isUser={true} />;
};

const UserActionBar: FC = () => {
  const messageId = useAuiState((s) => s.message.id);
  const isLatestUserMessage = useChatStore((s) => {
    const session = s.activeSessionId ? s.bySession[s.activeSessionId] : null;
    if (!session) return false;
    const userMessages = session.messages.filter((m) => m.role === "user");
    return userMessages.length > 0 && userMessages[userMessages.length - 1].id.toString() === messageId;
  });

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      {isLatestUserMessage && (
        <ActionBarPrimitive.Edit asChild>
          <TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
            <PencilIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.Edit>
      )}
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root bg-muted ms-auto flex w-full max-w-[85%] flex-col rounded-2xl">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent p-4 text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">Update</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

