import { useGame } from "./state/useGame";
import { SetupScreen } from "./components/SetupScreen";
import { GameScreen } from "./components/GameScreen";

export default function App() {
  const { game, pending, log, startGame, touchdown, buyBack, endGame } = useGame();

  if (!game) {
    return <SetupScreen onConfirm={startGame} />;
  }

  return (
    <GameScreen game={game} pending={pending} log={log} onTouchdown={touchdown} onBuyBack={buyBack} onEndGame={endGame} />
  );
}
