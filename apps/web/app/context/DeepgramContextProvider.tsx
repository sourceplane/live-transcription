"use client";

import {
  createClient,
  LiveClient,
  LiveConnectionState,
  LiveTranscriptionEvents,
  type LiveSchema,
  type LiveTranscriptionEvent,
} from "@deepgram/sdk";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  FunctionComponent,
} from "react";

import { fetchLiveSession, sessionError } from "@/lib/live-session";
import { WorkersAiLiveClient } from "@/lib/workers-ai-live";
import { useMicrophone } from "./MicrophoneContextProvider";

// Deepgram's own live client when the owner stored a Deepgram key, or the
// Workers AI socket (lib/workers-ai-live.ts) that speaks to the page as it
// does when they did not.
type LiveConnection = LiveClient | WorkersAiLiveClient;

interface DeepgramContextType {
  connection: LiveConnection | null;
  connectToDeepgram: (options: LiveSchema, endpoint?: string) => Promise<void>;
  disconnectFromDeepgram: () => void;
  connectionState: LiveConnectionState;
  // Why there is no connection, when there cannot be one.
  notice: string | null;
}

const DeepgramContext = createContext<DeepgramContextType | undefined>(
  undefined
);

interface DeepgramContextProviderProps {
  children: ReactNode;
}

const DeepgramContextProvider: FunctionComponent<
  DeepgramContextProviderProps
> = ({ children }) => {
  const { microphone } = useMicrophone();
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  const [connectionState, setConnectionState] = useState<LiveConnectionState>(
    LiveConnectionState.CLOSED
  );
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Connects to the speech recognition service and sets up a live transcription session.
   *
   * @param options - The configuration options for the live transcription session (Deepgram's own socket).
   * @param endpoint - The optional endpoint URL for the Deepgram service.
   * @returns A Promise that resolves when the connection is established.
   */
  const connectToDeepgram = async (options: LiveSchema, endpoint?: string) => {
    const session = await fetchLiveSession();
    const error = sessionError(session);
    if (error) {
      setNotice(error);
      return;
    }

    let conn: LiveConnection;
    if (session.provider === "deepgram" && "access_token" in session) {
      const deepgram = createClient({ accessToken: session.access_token });
      conn = deepgram.listen.live(options, endpoint);
    } else if (session.provider === "workers-ai" && microphone) {
      conn = await WorkersAiLiveClient.connect(microphone.stream);
    } else {
      setNotice("Live transcription needs the microphone.");
      return;
    }

    conn.addListener(LiveTranscriptionEvents.Open, () => {
      setConnectionState(LiveConnectionState.OPEN);
    });

    conn.addListener(LiveTranscriptionEvents.Close, () => {
      setConnectionState(LiveConnectionState.CLOSED);
    });

    setNotice(null);
    setConnection(conn);
  };

  const disconnectFromDeepgram = async () => {
    if (connection) {
      connection.finish();
      setConnection(null);
    }
  };

  return (
    <DeepgramContext.Provider
      value={{
        connection,
        connectToDeepgram,
        disconnectFromDeepgram,
        connectionState,
        notice,
      }}
    >
      {children}
    </DeepgramContext.Provider>
  );
};

function useDeepgram(): DeepgramContextType {
  const context = useContext(DeepgramContext);
  if (context === undefined) {
    throw new Error(
      "useDeepgram must be used within a DeepgramContextProvider"
    );
  }
  return context;
}

export {
  DeepgramContextProvider,
  useDeepgram,
  LiveConnectionState,
  LiveTranscriptionEvents,
  type LiveTranscriptionEvent,
};
