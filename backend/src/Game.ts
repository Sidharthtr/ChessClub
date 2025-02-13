import { Chess } from "chess.js";
import WebSocket from "ws";
import { GAME_ALERT, GAME_OVER, INIT_GAME, MOVE } from "./message";

export class Game {
  public player1: WebSocket;
  public player2: WebSocket;
  private board: Chess;
  private moves: string[];
  private startTime: Date;
  private moveCount = 0;

  constructor(player1: WebSocket, player2: WebSocket) {
    this.player1 = player1;
    this.player2 = player2;
    this.board = new Chess();
    this.moves = [];
    this.startTime = new Date();

    this.player1.send(
      JSON.stringify({
        type: INIT_GAME,
        payload: {
          color: "white",
        },
      })
    );

    this.player2.send(
      JSON.stringify({
        type: INIT_GAME,
        payload: {
          color: "black",
        },
      })
    );
  }
  makeMove(
    socket: WebSocket,
    move: {
      from: string;
      to: string;
    }
  ) {
        if (this.moveCount%2 === 0 && socket != this.player1) {
          socket.send(JSON.stringify({type: GAME_ALERT, payload: "not your turn"}))
          return;
        }
        if (this.moveCount%2 === 1 && socket != this.player2) {
          socket.send(JSON.stringify({type: GAME_ALERT, payload: "not your turn"}))
          return;
        }

        try {
            this.board.move(move);
          } catch (e) {
            console.log(e);
            return;
        }

        this.player2.send(
          JSON.stringify({
            type: MOVE,
            payload: move,
          })
        );
        
      
        this.player1.send(
          JSON.stringify({
            type: MOVE,
            payload: move,
          })
        );
        
        if (this.board.isGameOver()) {
          console.log("game over in server")
          this.player1.send(
            JSON.stringify({
              type: GAME_OVER,
              payload: {
                winner: this.board.turn() === "w" ? "black" : "white",
              },
            })
          );
          this.player2.send(
            JSON.stringify({
              type: GAME_OVER,
              payload: {
                winner: this.board.turn() === "w" ? "black" : "white",
              },
            })
          );
      }
    
      
      this.moveCount++;
   }
    
   
  };

