import { useEffect, useState } from "react";
import { useGame } from "./state/useGame";
import { SetupScreen } from "./components/SetupScreen";
import { GameScreen } from "./components/GameScreen";
import { CredentialsSetup } from "./components/CredentialsSetup";
import { loadCredentials, type StoredCredentials } from "./kalshi/keyStore";
import { setActiveCredentials } from "./kalshi/client";

export default function App() {
  const [creds, setCreds] = useState<StoredCredentials | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);
  const { game, pending, log, startGame, touchdown, buyBack, endGame } = useGame();

  useEffect(() => {
    loadCredentials()
      .then((stored) => {
        if (stored) {
          setActiveCredentials(stored);
          setCreds(stored);
        }
      })
      .finally(() => setCheckedStorage(true));
  }, []);

  if (!checkedStorage) {
    return null;
  }

  if (!creds) {
    return <CredentialsSetup locked={null} onLocked={setCreds} onUnlocked={() => setCreds(null)} />;
  }

  return (
    <div className="flex min-h-screen flex-col gap-3 px-4 pt-4">
      <div className="mx-auto w-full max-w-3xl">
        <CredentialsSetup locked={creds} onLocked={setCreds} onUnlocked={() => setCreds(null)} />
      </div>
      {!game ? (
        <SetupScreen onConfirm={startGame} />
      ) : (
        <GameScreen game={game} pending={pending} log={log} onTouchdown={touchdown} onBuyBack={buyBack} onEndGame={endGame} />
      )}
    </div>
  );
}
