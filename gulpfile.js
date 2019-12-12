var gulp = require('gulp'),
    uglify = require('gulp-uglify'), // 压缩js文件
    sass = require('gulp-sass'), // 编译sass
    cleanCSS = require('gulp-clean-css'), // 压缩css文件
    rename = require('gulp-rename'); // 文件重命名

gulp.task('scripts', function(){
    gulp.src('src/js/main.js')
        .pipe(uglify())
        .pipe(rename({suffix: '.min'}))
        .pipe(gulp.dest('assets/js'))
});

gulp.task('sass', function(){
    gulp.src('src/sass/app.scss')
        .pipe(sass())
        .pipe(gulp.dest('src/sass'))
        .pipe(cleanCSS())
        .pipe(rename({suffix: '.min'}))
        .pipe(gulp.dest('assets/css'));
});

gulp.task('watch', function(){
    gulp.watch('src/sass/*.scss', ['sass']);
    gulp.watch('src/js/*.js', ['scripts']);
});

console.log("test");

gulp.task('default', ['scripts', 'sass', 'watch']);