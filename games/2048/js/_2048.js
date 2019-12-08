let handler2048 = {};
(function(handler2048) {
	handler2048.newHandler = function(args) {
		let handler = new _handler2048(args);
		handler.init();
		return handler;
	};
	
	let _handler2048 = function(args) {//constructor, init variables
		this.fullWidth = window.screen.availWidth;
		this.containerWidth = 0.92 * this.fullWidth;
		this.cellLength = 0.18 * this.fullWidth;
		this.cellSpace = 0.04 * this.fullWidth;
		this.board = new Array();
		this.score = 0;
		this.hasConflicted = new Array();
		this.startx = 0;
		this.starty = 0;
		this.endx = 0;
		this.endy = 0;
		this.$score = args.$score;
		this.$container = args.$container;
		this.$cells = args.$cells;
		this.cellPrefix = args.cellPrefix;
		this.$gameResetBtn = args.$gameResetBtn;
	};
	
	_handler2048.prototype = {//handler functions
		init: function() {
			if (this.fullWidth > 500) {
				this.containerWidth = 500;
				this.cellLength = 100;
				this.cellSpace = 20;
			}
			this.$container.css('width', this.containerWidth - 2 * this.cellSpace)
			.css('height', this.containerWidth - 2 * this.cellSpace)
			.css('padding', this.cellSpace)
			.css('border-radius', 0.02 * this.containerWidth);
			this.$cells.css('width', this.cellLength)
			.css('height', this.cellLength)
			.css('border-radius', 0.02 * this.containerWidth);
			
			//listener
			this.bindKeyboardListener();
			this.bindScreenEvent();
			this.$gameResetBtn.click(() => {
				this.gameReset();
			}).trigger("click");
		},
		
		bindKeyboardListener: function() {
			$(document).keydown((event) => {
				if (this.$score.text() == "Success!") {
					this.gameReset();
					return;
				}
				switch (event.keyCode) {
					case 37: //left
						event.preventDefault();
						if (this.moveLeft()) {
							window.setTimeout(() => this.generateNumber(), 210);
							window.setTimeout(() => this.isGameover(), 300);
						}
						break;
					case 38: //up
						event.preventDefault();
						if (this.moveUp()) {
							window.setTimeout(() => this.generateNumber(), 210);
							window.setTimeout(() => this.isGameover(), 300);
						}
						break;
					case 39: //right
						event.preventDefault();
						if (this.moveRight()) {
							window.setTimeout(() => this.generateNumber(), 210);
							window.setTimeout(() => this.isGameover(), 300);
						}
						break;
					case 40: //down
						event.preventDefault();
						if (this.moveDown()) {
							window.setTimeout(() => this.generateNumber(), 210);
							window.setTimeout(() => this.isGameover(), 300);
						}
						break;
					default:
						break;
				}
			});
		},
		
		bindScreenEvent: function() {
			document.addEventListener('touchstart', (event) => {
				this.startx = event.touches[0].pageX;
				this.starty = event.touches[0].pageY;
			});
			document.addEventListener('touchmove', (event) => {
				event.preventDefault();
			});
			document.addEventListener('touchend', (event) => {
				this.endx = event.changedTouches[0].pageX;
				this.endy = event.changedTouches[0].pageY;
				let deltax = this.endx - this.startx;
				let deltay = this.endy - this.starty;
				if (Math.abs(deltax) < 0.3 * this.fullWidth && Math.abs(deltay) < 0.3 * this.fullWidth) {
					return;
				}
				if (this.$score.text() == "Success!") {
					this.gameReset();
					return;
				}
				//x
				if (Math.abs(deltax) >= Math.abs(deltay)) {
					if (deltax > 0) {
						//move right
						if (this.moveRight()) {
							window.setTimeout(() => this.generateNumber(), 210);
							window.setTimeout(() => this.isGameover(), 300);
						}
					} else {
						//move left
						if (this.moveLeft()) {
							window.setTimeout(() => this.generateNumber(), 210);
							window.setTimeout(() => this.isGameover(), 300);
						}
					}
				} else {  //y
					if (deltay > 0) {
						//move down
						if (this.moveDown()) {
							window.setTimeout(() => this.generateNumber(), 210);
							window.setTimeout(() => this.isGameover(), 300);
						}
					} else {
						//move up
						if (this.moveUp()) {
							window.setTimeout(() => this.generateNumber(), 210);
							window.setTimeout(() => this.isGameover(), 300);
						}
					}
				}
			});
		},
		
		gameReset: function() {
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 4; j++) {
					let cell = $("#" + this.cellPrefix + i + '_' + j);
					cell.css('top', this.getTop(i, j));
					cell.css('left', this.getLeft(i, j));
				}
			}
			for (let i = 0; i < 4; i++) {
				this.board[i] = new Array();
				this.hasConflicted[i] = new Array();
				for (let j =0; j < 4; j++) {
					this.board[i][j] = 0;
					this.hasConflicted[i][j] = false;
				}
			}
			this.viewUpdate();
			this.score = 0;
			this.updateScore(this.score);
			
			this.generateNumber();
			this.generateNumber();
		},
		
		getTop: function(i, j) {
			return this.cellSpace + i * (this.cellSpace + this.cellLength);
		},
		
		getLeft: function(i, j) {
			return this.cellSpace + j * (this.cellSpace + this.cellLength);
		},
		
		getBgColor: function(number) {
			switch (number) {
				case 2: return '#eee4da'; break;
				case 4: return '#ede0c8'; break;
				case 8: return '#f2b179'; break;
				case 16: return '#f59563'; break;
				case 32: return '#f67c5f'; break;
				case 64: return '#f65e3b'; break;
				case 128: return '#edcf72'; break;
				case 256: return '#edcc61'; break;
				case 512: return '#9c0'; break;
				case 1024: return '#33b5e5'; break;
				case 2048: return '#09c'; break;
				case 4096: return '#a6c'; break;
				case 8192: return '#93c'; break;
			}
			return '#ffffff';
		},
		
		getNumberColor: function(number) {
			if (number <= 4)
				return '#776e65';
			return '#000000';
		},
		
		noSpaceLeft: function() {
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 4; j++) {
					if (this.board[i][j] == 0) {
						return false;
					}
				}
			}
			return true;
		},
		
		leftable: function() {
			for (let i = 0; i < 4; i++) {
				for (let j = 1; j < 4; j++) {
					if (this.board[i][j] != 0) {
						if (this.board[i][j - 1] == 0 || this.board[i][j] == this.board[i][j - 1]) {
							return true;
						}
					}
				}
			}
			return false;
		},
		
		rightable: function() {
			for (let i = 0; i < 4; i++) {
				for (let j = 2; j >= 0; j--) {
					if (this.board[i][j] != 0) {
						if (this.board[i][j + 1] == 0 || this.board[i][j] == this.board[i][j + 1]) {
							return true;
						}
					}
				}
			}
			return false;
		},
		
		upable: function() {
			for (let j = 0; j < 4; j++) {
				for (let i = 1; i < 4; i++) {
					if (this.board[i][j] != 0) {
						if (this.board[i - 1][j] == 0 || this.board[i - 1][j] == this.board[i][j]) {
							return true;
						}
					}
				}
			}
			return false;
		},
		
		downable: function() {
			for (let j = 0; j < 4; j++) {
				for (let i = 2; i >= 0; i--) {
					if (this.board[i][j] != 0) {
						if (this.board[i + 1][j] == 0 || this.board[i + 1][j] == this.board[i][j]) {
							return true;
						}
					}
				}
			}
			return false;
		},
		
		moveable() {
			return (downable() || upable() || rightable() || leftable());
		},
		
		moveLeft: function(){
			if (!this.leftable()) {
				return false;
			}
			//move left
			for (let i = 0; i < 4; i++) {
				for (let j = 1; j < 4; j++) {
					if (this.board[i][j] != 0) {
						for (let k = 0; k < j; k++) {
							if (this.board[i][k] == 0 && this.noHorizontalBlock(i, k, j)) {
								this.moveNumber(i, j, i, k);
								this.board[i][k] = this.board[i][j];
								this.board[i][j] = 0;
								break;
							} else if (this.board[i][k] == this.board[i][j] && this.noHorizontalBlock(i, k, j) && !this.hasConflicted[i][k]) {
								this.moveNumber(i, j, i, k);
								this.board[i][k] += this.board[i][j]
								this.board[i][j] = 0;
								//add score
								this.score += this.board[i][k];
								this.updateScore();
								this.hasConflicted[i][k] = true;
								break;
							}
						}
					}
				}
			}

			window.setTimeout(() => this.viewUpdate(), 200);
			return true;
		},
		
		moveRight: function() {
			if (!this.rightable()) {
				return false;
			}
			//move right
			for (let i = 0; i < 4; i++) {
				for (let j = 2; j >= 0; j--) {
					if (this.board[i][j] != 0) {
						for (let k = 3; k > j; k--) {
							if (this.board[i][k] == 0 && this.noHorizontalBlock(i, j, k)) {
								this.moveNumber(i, j, i, k);
								this.board[i][k] = this.board[i][j];
								this.board[i][j] = 0;
								break;
							} else if (this.board[i][k] == this.board[i][j] && this.noHorizontalBlock(i, j, k) && !this.hasConflicted[i][k]) {
								this.moveNumber(i, j, i, k);
								this.board[i][k] += this.board[i][j];
								this.board[i][j] = 0;
								//add score
								this.score += this.board[i][k];
								this.hasConflicted[i][k] = true;
								break;
							}
						}
					}
				}
			}
			
			window.setTimeout(() => this.viewUpdate(), 200);
			return true;
		},
		
		moveUp: function() {
			if (!this.upable()) {
				return false;
			}
			//move up
			for (let j = 0; j < 4; j++) {
				for (let i = 1; i < 4; i++) {
					if (this.board[i][j] != 0) {
						for (let k = 0; k < i; k++) {
							if (this.board[k][j] == 0 && this.noVerticalBlock(j, k, i)) {
								this.moveNumber(i, j, k, j);
								this.board[k][j] = this.board[i][j];
								this.board[i][j] = 0;
								break;
							} else if (this.board[k][j] == this.board[i][j] && this.noVerticalBlock(j, k, i) && !this.hasConflicted[k][j]) {
								this.moveNumber(i, j, k, j);
								this.board[k][j] += this.board[i][j];
								this.board[i][j] = 0;
								//add score
								this.score += this.board[k][j];
								this.updateScore();
								this.hasConflicted[k][j] = true;
								break;
							}
						}
					}
				}
			}
			
			window.setTimeout(() => this.viewUpdate(), 200);
			return true;
		},
		
		moveDown: function() {
			if (!this.downable()) {
				return false;
			}
			//move down
			for (let j = 0; j < 4; j++) {
				for (let i = 2; i >= 0; i--) {
					if (this.board[i][j] != 0) {
						for (let k = 3; k > i; k--) {
							if (this.board[k][j] == 0 && this.noVerticalBlock(j, i, k)) {
								this.moveNumber(i, j, k, j);
								this.board[k][j] = this.board[i][j];
								this.board[i][j] = 0;
								break;
							} else if (this.board[k][j] == this.board[i][j] && this.noVerticalBlock(j, i, k) && !this.hasConflicted[k][j]) {
								this.moveNumber(i, j, k, j);
								this.board[k][j] += this.board[i][j];
								this.board[i][j] = 0;
								//add score
								this.score += board[k][j];
								this.updateScore();
								this.hasConflicted[k][j] = true;
								break;
							}
						}
					}
				}
			}
			
			window.setTimeout(() => this.viewUpdate(), 200);
			return true;  
		},
		
		moveDown: function() {
			if (!this.downable()) {
				return false;
			}
			//move down
			for (let j = 0; j < 4; j++) {
				for (let i = 2; i >= 0; i--) {
					if (this.board[i][j] != 0) {
						for (let k = 3; k > i; k--) {
							if (this.board[k][j] == 0 && this.noVerticalBlock(j, i, k)) {
								this.moveNumber(i, j, k, j);
								this.board[k][j] = this.board[i][j];
								this.board[i][j] = 0;
								break;
							} else if (this.board[k][j] == this.board[i][j] && this.noVerticalBlock(j, i, k) && !this.hasConflicted[k][j]) {
								this.moveNumber(i, j, k, j);
								this.board[k][j] += this.board[i][j];
								this.board[i][j] = 0;
								//add score
								this.score += this.board[k][j];
								this.updateScore();
								this.hasConflicted[k][j] = true;
								break;
							}
						}
					}
				}
			}
			
			window.setTimeout(() => this.viewUpdate(), 200);
			return true;  
		},
		
		noHorizontalBlock: function(row, col1, col2) {
			for (let i = col1 + 1; i < col2; i++) {
				if (this.board[row][i] != 0) {
					return false;
				}
			}
			return true;
		},
		
		
		noVerticalBlock: function(col, row1, row2) {
			for (let i = row1 + 1; i < row2; i++) {
				if (this.board[i][col] != 0) {
					return false;
				}
			}
			return true;
		},
		
		showNumber: function(i, j, randBumber) {
			let $number = $('#number_' + i + '_' + j);
			$number.css('background-color', this.getBgColor(randBumber))
			.css('color', this.getNumberColor(randBumber))
			.text(randBumber)
			.animate({
				width: this.cellLength,
				height: this.cellLength,
				top: this.getTop(i, j),
				left: this.getLeft(i, j)
			}, 50);
		},
		
		moveNumber: function(fromx, fromy, tox, toy) {
			let $number = $('#number_' + fromx + '_' + fromy);
			$number.animate({
				top: this.getTop(tox, toy),
				left: this.getLeft(tox, toy)
			}, 200);
		},
		
		newNumberCell: function(i, j) {
			return $("<div></div>", {
				"class": "number",
				"id": "number_" + i + "_" + j,
				"style": "line-height: " + this.cellLength + "px; font-size: " + (this.cellLength * 0.6) + "px"
			})
		},
		
		viewUpdate: function() {
			$('.number').remove();
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 4; j++) {
					let $number = this.newNumberCell(i, j);
					this.$container.append($number);
					if (this.board[i][j] == 0) {
						$number.css('width', '0px');
						$number.css('height', '0px');
						$number.css('top', this.getTop(i, j) + this.cellLength / 2);
						$number.css('left', this.getLeft(i, j) +this.cellLength / 2);
					} else {
						$number.css('width', this.cellLength);
						$number.css('height', this.cellLength);
						$number.css('top', this.getTop(i, j));
						$number.css('left', this.getLeft(i, j));
						$number.css('background-color', this.getBgColor(this.board[i][j]));
						$number.css('color', this.getNumberColor(this.board[i][j]));
						$number.text(this.board[i][j]);
					}
					this.hasConflicted[i][j] = false;
				}
			}
		},
		
		generateNumber: function() {
			if (this.noSpaceLeft()) {
				return false;
			}

			let randx = parseInt(Math.floor(Math.random() * 4));
			let randy = parseInt(Math.floor(Math.random() * 4));
			let time = 0;
			while (time < 50) {
				if (this.board[randx][randy] == 0) {
					break;
				}
				randx = parseInt(Math.floor(Math.random() * 4));
				randy = parseInt(Math.floor(Math.random() * 4));
				time++;
			}
			if (time == 50) {
				for (let i = 0; i < 4; i++) {
					for (let j = 0; j < 4; j++) {
						if (this.board[i][j] == 0) {
							randx = i;
							randy = j;
						}
					}
				}
			}

			let randNumber = Math.random() < 0.5 ? 2 : 4;
			this.board[randx][randy] = randNumber;
			this.showNumber(randx, randy, randNumber);
			return true;
		},
		
		updateScore: function() {
			this.$score.text(this.score);
		},
		
		isGameover: function() {
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 4; j++) {
					if (this.board[i][j] == 2048) {
						this.updateScore("Success!");
						return;
					}
				}
			}
			if (this.noSpaceLeft() && nomove()) {
				this.updateScore("Game Over!");
			}
		}
	}
})(handler2048);
