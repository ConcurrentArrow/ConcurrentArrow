class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        
        return this;
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        
        return this;
    }

    mul(s) {
        this.x *= s;
        this.y *= s;
        return this;
    }

    clone() {
        return new Vec2(this.x, this.y);
    }

    dot(that) {
	return this.x * that.x + this.y * that.y;
    }
    fsub(that) {
	    return this.clone().sub(that);
    }
    fmul(s) {
	    return this.clone().mul(s);
    }
    fadd(that) {
	    return this.clone().add(that);
    }
    abs() {
	    return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}

const HOURS = '12 1 2 3 4 5 6 7 8 9 10 11'.split(' ');

function isStable(buffer) {
    const first = buffer[0];
    for (const item of buffer) {
        if (Math.round(item.x) !== Math.round(first.x) || Math.round(item.y) !== Math.round(first.y)) {
            return false;
        }
    }
    return true;
}

function formatDate(date) {
    const days = [
        'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'
    ];
    const months = [
        'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
    ];
    const dayOfWeek = days[date.getDay()];
    const dayOfMonth = date.getDate();
    const year = date.getYear() + 1900;        
    const month = months[date.getMonth()];
    return ' ' + dayOfWeek + ' ' + dayOfMonth + ' ' + month + ' ' + year + ' ';
}

const colors = [
    'orange',
    'lightgreen',
    'pink',
    'purple',
    'cyan',
    'magenta',
    'brown',
    'gray',
    'aquamarine'
];

let currentColor = 0;
function nextColor() {
    currentColor = (currentColor+1) % colors.length;
    return colors[currentColor];
}

let messageNumber = 0;
function log(message) {
    window.logger.value += `[${++messageNumber}]: ${message}\n`;
    window.logger.scrollTop = window.logger.scrollHeight;
}
