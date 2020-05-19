//Gulp
const gulp = require('gulp');
const sass = require('gulp-sass');
const uglify = require('gulp-uglify');
sass.compiler = require('node-sass');
gulp.task('sass', function() {
    return gulp.src('./public/src/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest('./public/dist'));
});
gulp.task('minifyJs', function() {
    return gulp.src(['./public/src/scripts.js'])
        .pipe(uglify())
        .pipe(gulp.dest('./public/dist'))
});
gulp.task('watch', function() {
    gulp.watch('./public/src/*.scss', gulp.parallel('sass'));
    gulp.watch('./public/src/*.js', gulp.parallel('minifyJs'));
});
gulp.task('default', gulp.parallel('sass', 'minifyJs', 'watch'));