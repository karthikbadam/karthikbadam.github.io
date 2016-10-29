/**
 * Created by karthik on 10/29/16.
 */

$(document).ready(function () {

    d3.json("/assets/data/projects.json", function (data) {

        // Empty the div
        d3.select("#projectsList").empty();
        var projectsList = d3.select("#projectsList").style("float", "left");
        // projectsList.append("div").html("Karthik has worked on " + data.length + " funded research projects");

        // projects
        projectsContent = projectsList.append("div").attr("id", "projectsContent");

        data.forEach(function (project, i) {
            projectsContent.append("h3").text(project.title);
            showProject(projectsContent, project, i);
        });

    });

});

function showProject (projectsContent, project, i) {

    projectsContent.append("div").style("float", "left").style("display", "block")
        .style("width", "100%")
        .style("class", "archive");

    var pro = projectsContent.append("div").style("display", "block")
        .style("padding-left", "10px")
        .style("line-height", "1")
        .style("margin-bottom", "20px")
        .style("background", "white");

    pro.append("div").style("width", "200px")
        .style("height", "140px")
        .style("display", "inline-block")
        .style("border", "1.5px solid #222")
        .style("background-size", "cover")
        .style("background-repeat", "no-repeat")
        .style("vertical-align", "top")
        .style("background-image", "url(/assets/images/" + project.name + ".png");

    var proInfo = pro.append("div").style("width", "calc(100% - 200px)")
        .style("height", "100%")
        .style("background", "white")
        .style("padding-left", "10px")
        .style("height", "72px")
        .style("display", "inline-block");

    if ("comments" in project) {
        proInfo.append("span").html("<u>" + project.comments + "</u>. ").style("font-size", "14px");
    }

    proInfo.append("span").html("Advised by: ").style("font-size", "14px");
    project.advisors.forEach(function (advisor, j) {
        if (j != project.advisors.length - 1) {
            advisor = advisor + ", ";
        } else {
            advisor = advisor + "<br/>";
        }
        proInfo.append("span").html(advisor).style("font-size", "14px");
    });

    proInfo.append("span").html(project.abstract+"<br/>").style("font-size", "12px");

    proInfo.append("span").html("Publication venues: ").style("font-size", "12px");
    project.publications.forEach(function (publication, j) {
        if (j != project.publications.length - 1) {
            publication = publication + ", ";
        } else {
            publication = publication + "<br/>";
        }
        proInfo.append("span").html(publication).style("font-size", "12px");
    });



}

