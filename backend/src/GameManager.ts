import { Game } from "./Game";
import { WebSocket } from 'ws';
import {
    GAME_OVER,
    INIT_GAME,
    JOIN_GAME,
    MOVE,
    OPPONENT_DISCONNECTED,
    JOIN_ROOM,
    GAME_JOINED,
    GAME_NOT_FOUND,
    GAME_ALERT,
    GAME_ADDED,
    GAME_ENDED,
  } from './message';

export class GameManager{
    private games:Game[];
    private pendingUser:WebSocket|null;
    private users:WebSocket[];

    constructor(){
        this.games = [];
        this.pendingUser = null;
        this.users = [];
    }

    addUser(socket:WebSocket){
       this.users.push(socket);
       this.addHandle(socket);
    }
    removeUser(socket:WebSocket){
        this.users = this.users.filter(user=>user!=socket);
    }

    private addHandle(socket:WebSocket){
      socket.on("message",(data)=>{
        const message = JSON.parse(data.toString());
         console.log(message);
        if(message.type===INIT_GAME){
            if(this.pendingUser){
              
               const game = new Game(this.pendingUser,socket);
               this.games.push(game);
               this.pendingUser =null; 
               console.log("Game started message send from server")
            }else{
               this.pendingUser = socket;
            }
        }
        if (message.type === MOVE) {
            const game = this.games.find((game) => game.player1 === socket ||game.player2 === socket);
            if (game) {
              game.makeMove(socket, message.move);
              
            }
          }
      })
    }
}