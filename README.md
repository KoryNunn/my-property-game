# My Property

A small top-down browser game about keeping your house standing while avoiding council fines. No dependencies or build step.

Run `npm start`, then open http://localhost:4173. You can also open `index.html` using a static web server. Set `PORT` to change the server port.

Survive 90 seconds with your house intact. Move with WASD or arrow keys, hold Space near a tree to cut it, hold Shift while moving to dash, and hold E at a stump to replant. Replanting reduces suspicion and delays regrowth. The house blocks council sight. Falling trees damage the house by 20%. Press P to pause. On-screen controls support touch devices; sound is optional.

Every standing tree has a countdown bar and seconds remaining until it starts falling. The bar shrinks and changes from green to amber to red as the fall approaches.

Start with $200 and earn $8 per second while playing. When suspicion fills, council officers chase you around the house. They charge a $120 fine only when they reach you; dash away and break their sight for five seconds to escape. Fines can put you into debt, which wages automatically repay. Fine count does not end the game.

Stand within 48 pixels of the house and hold R without moving for two seconds to buy a repair: $60 restores up to 20% condition. Repairs require enough cash and stop when you move, leave the house, or release R. A house at 0% condition ends the game. Pausing freezes wages, pursuit, damage, and repairs.
