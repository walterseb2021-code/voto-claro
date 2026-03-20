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

  // Obtener pregunta aleatoria, evitando repetir en la misma partida
  const fetchRandomQuestion = useCallback(async (excludeIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from('reto_questions')
        .select('id, question, answer')
        .eq('level', 2)
        .eq('party_id', 'app')
        .limit(100);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const available = data.filter(q => !excludeIds.includes(q.id));
      if (available.length === 0) {
        // Si ya respondió todas, repetir una (pero no debería ocurrir con muchas preguntas)
        const randomIndex = Math.floor(Math.random() * data.length);
        return data[randomIndex] as Question;
      }

      const randomIndex = Math.floor(Math.random() * available.length);
      return available[randomIndex] as Question;
    } catch (error) {
      console.error('Error fetching question:', error);
      return null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setState(prev => {
        if (prev.timeLeft <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Tiempo agotado → respuesta incorrecta
          handleAnswer(false);
          return { ...prev, timeLeft: 0 };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
  }, []);

  // Manejar la respuesta del jugador (llamada desde el modal)
  const handleAnswer = useCallback((isCorrect: boolean) => {
    if (!state.currentQuestion || state.pendingRoll === null) return;

    // Detener el temporizador
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    const roll = state.pendingRoll;
    let newPosition = state.position;

    if (isCorrect) {
      newPosition = Math.min(state.position + roll, TOTAL_SQUARES);
    } else {
      newPosition = Math.max(state.position - roll, 0);
    }

    const newTurnsLeft = state.turnsLeft - 1;
    const reachedEnd = newPosition === TOTAL_SQUARES;
    const noTurnsLeft = newTurnsLeft === 0;
    const gameFinished = reachedEnd || noTurnsLeft;

    setState(prev => ({
      ...prev,
      position: newPosition,
      turnsLeft: newTurnsLeft,
      answeredQuestions: [...prev.answeredQuestions, prev.currentQuestion!.id],
      showQuestion: false,
      currentQuestion: null,
      // Mantenemos pendingRoll y currentRoll para mostrar el último número
      // pero la próxima tirada los reemplazará
      timeLeft: QUESTION_TIME_SEC,
      gameOver: gameFinished && !reachedEnd,
      won: reachedEnd,
    }));

    if (reachedEnd && mode === 'con_premio') {
      onWin?.();
    }
  }, [state, mode, onWin]);

  // Lanzar el dado: muestra número, carga pregunta, activa modal
  const rollDice = useCallback(async () => {
    // No se puede lanzar si el juego terminó, ganó, ya hay pregunta activa, o no quedan turnos
    if (state.gameOver || state.won || state.showQuestion || state.turnsLeft === 0) return;

    // Generar número del dado
    const roll = Math.floor(Math.random() * 6) + 1;

    // Obtener pregunta (puede ser asíncrono)
    const question = await fetchRandomQuestion(state.answeredQuestions);
    if (!question) {
      // Si no hay pregunta, termina el juego (error)
      setState(prev => ({ ...prev, gameOver: true }));
      return;
    }

    // Actualizar estado: mostrar el número, guardar el roll pendiente, mostrar la pregunta
    setState(prev => ({
      ...prev,
      currentRoll: roll,
      pendingRoll: roll,
      showQuestion: true,
      currentQuestion: question,
      timeLeft: QUESTION_TIME_SEC,
    }));
    startTimer();
  }, [state, fetchRandomQuestion, startTimer]);

  // Reiniciar completamente
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