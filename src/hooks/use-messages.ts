"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTeamMessage,
  listTeamMessages,
  markTeamMessageRead,
  sendTeamMessage,
} from "@/lib/api";

export function useMyMessages() {
  return useQuery({
    queryKey: ["messages", "inbox"],
    queryFn: () => listTeamMessages(false),
  });
}

export function useSentMessages(enabled = true) {
  return useQuery({
    queryKey: ["messages", "sent"],
    queryFn: () => listTeamMessages(true),
    enabled,
  });
}

export function useMessage(id: string | null) {
  return useQuery({
    queryKey: ["messages", "detail", id],
    queryFn: () => getTeamMessage(id as string),
    enabled: Boolean(id),
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sendTeamMessage,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

export function useMarkMessageRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markTeamMessageRead(id),
    onSuccess: () => {
      // The unread count in the bell is derived from the notification feed, so both
      // have to be refreshed — reading the message does not clear its notification.
      void qc.invalidateQueries({ queryKey: ["messages"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
