// src/app/reto-ciudadano/components/CaminoCiudadano/useCaminoCiudadano.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { GameState, GameMode, Question } from './types';

const TOTAL_SQUARES = 30;
const INITIAL_TURNS = 10;
const QUESTION_TIME_SEC = 10;

export function useCaminoCiudadano(mode: GameMode, onWin?: () => void) {
  const [state, setState] = useState<GameState>({
    position: 0,
    turnsLeft: INITIAL_TURNS,
    answeredQuestions: [],
    currentRoll: null,
    pendingRoll: null,
    showQuestion: false,
    currentQuestion: null,
    timeLeft: QUESTION_TIME_SEC,
    gameOver: false,
    won: false,
    locked: false,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fetchRandomQuestion = useCallback(async (excludeIds: string[]) => {
    // Excluir IDs vacíos correctamente
    const excludeClause = excludeIds.length > 0 ? `not (id in (${excludeIds.map(id => `'${id}'`).join(',')}))` : '';
    const { data, error } = await supabase
      .from('reto_questions')
      .select('id, question, answer')
      .eq('level', 2)
      .eq('party_id', 'app')
      .limit(1);
    // Aplicar exclusión manual si hay IDs
    let filteredData = data;
    if (excludeIds.length > 0 && filteredData) {
      filteredData = filteredData.filter(q => !excludeIds.includes(q.id));
    }
    if (error || !filteredData || filteredData.length === 0) return null;
    return filteredData[0] as Question;
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setState(prev => {
        if (prev.timeLeft <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleAnswer(false);
          return { ...prev, timeLeft: 0 };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
  }, []);

  const handleAnswer = useCallback(async (isCorrect: boolean) => {
    if (!state.currentQuestion || !state.pendingRoll) return;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    let newPosition = state.position;
    const roll = state.pendingRoll;

    if (isCorrect) {
      newPosition = Math.min(state.position + roll, TOTAL_SQUARES);
    } else {
      newPosition = Math.max(state.position - roll, 0);
    }

    const newTurnsLeft = state.turnsLeft - 1;
    const gameFinished = newPosition === TOTAL_SQUARES || newTurnsLeft === 0;

    setState(prev => ({
      ...prev,
      position: newPosition,
      turnsLeft: newTurnsLeft,
      answeredQuestions: [...prev.answeredQuestions, prev.currentQuestion!.id],
      showQuestion: false,
      currentQuestion: null,
      pendingRoll: null,
      timeLeft: QUESTION_TIME_SEC,
      gameOver: gameFinished && newPosition !== TOTAL_SQUARES,
      won: newPosition === TOTAL_SQUARES,
    }));

    if (newPosition === TOTAL_SQUARES && mode === 'con_premio') {
      onWin?.();
    }
  }, [state, mode, onWin]);

  const rollDice = useCallback(async () => {
    if (state.gameOver || state.won || state.showQuestion || state.turnsLeft === 0) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    setState(prev => ({ ...prev, currentRoll: roll, pendingRoll: roll }));

    const question = await fetchRandomQuestion(state.answeredQuestions);
    if (!question) {
      setState(prev => ({ ...prev, gameOver: true }));
      return;
    }

    setState(prev => ({
      ...prev,
      showQuestion: true,
      currentQuestion: question,
      timeLeft: QUESTION_TIME_SEC,
    }));
    startTimer();
  }, [state, fetchRandomQuestion, startTimer]);

  const resetGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState({
      position: 0,
      turnsLeft: INITIAL_TURNS,
      answeredQuestions: [],
      currentRoll: null,
      pendingRoll: null,
      showQuestion: false,
      currentQuestion: null,
      timeLeft: QUESTION_TIME_SEC,
      gameOver: false,
      won: false,
      locked: false,
    });
  }, []);

  return {
    state,
    rollDice,
    handleAnswer,
    resetGame,
  };
}
