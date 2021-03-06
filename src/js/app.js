
// responsive tables
$(document).ready(function() {
    $("table").wrap("<div class='table-responsive'></div>");
    $("table").addClass("table");
});

// responsive embed videos
$(document).ready(function() {
    $('iframe[src*="youtube.com"]').wrap('<div class="embed-responsive embed-responsive-16by9"></div>');
    $('iframe[src*="youtube.com"]').addClass('embed-responsive-item');
    $('iframe[src*="vimeo.com"]').wrap('<div class="embed-responsive embed-responsive-16by9"></div>');
    $('iframe[src*="vimeo.com"]').addClass('embed-responsive-item');
});

// Navigation Scripts to Show Header on Scroll-Up
jQuery(document).ready(function($) {
    var MQL = 1170;

    //primary navigation slide-in effect
    if ($(window).width() > MQL) {
        var headerHeight = $('.navbar-custom').height(),
            bannerHeight  = $('.intro-header .container').height();     
        $(window).on('scroll', {
            previousTop: 0
        },
        function() {
            var currentTop = $(window).scrollTop(),
                $catalog = $('.side-catalog');

            //check if user is scrolling up by mouse or keyborad
            if (currentTop < this.previousTop) {
                //if scrolling up...
                if (currentTop > 0 && $('.navbar-custom').hasClass('is-fixed')) {
                    $('.navbar-custom').addClass('is-visible');
                } else {
                    $('.navbar-custom').removeClass('is-visible is-fixed');
                }
            } else {
                //if scrolling down...
                $('.navbar-custom').removeClass('is-visible');
                if (currentTop > headerHeight && !$('.navbar-custom').hasClass('is-fixed')) $('.navbar-custom').addClass('is-fixed');
            }
            this.previousTop = currentTop;


            //adjust the appearance of side-catalog
            $catalog.show()
            if (currentTop > (bannerHeight + 41)) {
                $catalog.addClass('fixed')
            } else {
                $catalog.removeClass('fixed')
            }
        });
    }
});

// search section
let nfSearcher = {};
(function(nfSearcher){
    'use strict'
    
    nfSearcher.newSearcher = function(args) {
		let searcher = new _nfSearcher(args);
		return searcher;
    };
	
    let _nfSearcher = function(args) {//constructor, init variables
        this.$searchInput = args.$searchInput;
        this.$searchBtn = args.$searchBtn;
        this.shouldRedirect = args.shouldRedirect || false;
        this.callback = args.callback;
        this.fuzzySearch = args.fuzzySearch;
        this.filter = args.filter;
        this.$groups = args.$groups;
        this.$items = args.$items;
        this.$searchHint = args.$searchHint;
        this.searchKeys = args.searchKeys || ["title", "categories", "tags", "date", "content"];
        this.postList = null;
    };

    _nfSearcher.prototype = {
        register: function() {
            this.$searchInput.keyup(e => {
                if (e.keyCode === 13) {
                  this.search(e.target.value);
                }
            });
            this.$searchBtn.click(() => {
                this.search(this.$searchInput.val());
            });
        },

        search: function(text) {
            text = text || this.$searchInput.val();
            if (!text) {
                this.$groups && this.$groups.show();
                this.$items && this.$items.show();
                this.$searchHint && this.$searchHint.hide();
                return;
            }

            text = text.toLowerCase();
            if (this.shouldRedirect || this.$groups.length === 0) {
                this.redirect(text);
                return;
            }

            // load search.json
            if (!this.postList) {
                this.loadJsonAndSearch(text);
            }
            else {
                this.doSearch(text);
            }
        },

        loadJsonAndSearch: function(text) {
            $.ajax({
                url: "/src/json/search.json",
                method: "GET",
                dataType : "json",
                success: data => {
                    this.postList = data;
                    this.doSearch(text);
                },
                error: error => {
                    console.error(error);
                }
            });
        },

        doSearch: function(text) {
            if (this.fuzzysearch) {
                this.fuzzysearch(text);
            }
            else {
                this.literalSearch(text);
            }
        },

        fuzzySearch: function(text) {

        },

        literalSearch: function(text) {
            if (!this.postList) {
                return;
            }
 
            let matches = [];
            outer: for (let i = 0; i < this.postList.length; i++) {
                let post = this.postList[i];
                for (let key in post) {
                    if (this.searchKeys.indexOf(key) === -1) {
                        continue;
                    }

                    let fullText = post[key];
                    if (fullText.indexOf(text) !== -1) {
                        matches.push(post);
                        break;
                    }
                }
            }

            if (matches.length > 0) {
                this.successCallback(matches);
                this.$searchHint.hide();
            }
            else {
                this.$groups.hide();
                this.$items.hide();
                this.$searchHint.show();
            }
        },

        successCallback: function(matches) {
            if (!matches || matches.length <= 0) {
                return;
            }
            if (this.filter) {
                this.filter(matches);
                return;
            }

            this.$groups.hide();
            this.$items.hide(); 
            for (let i = 0; i < matches.length; i++) {
                let post = matches[i];
                let group = document.getElementById(post.categories);
                let title = document.getElementById(post.id);
                if (group) {
                    $(group).show();
                }
                if (title) {
                    $(title).show();
                }
            }
        },

        redirect: function(text) {
            window.open("/category/?search=" + text);
        }
    }
    
}(nfSearcher));