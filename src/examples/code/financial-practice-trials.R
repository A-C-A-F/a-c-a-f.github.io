# Independent practice-trial example. Base R only; no external inputs.
# One observation per fictional trial. These checks describe this example only.
trials <- data.frame(
  trial_key = paste0("Trial ", LETTERS[1:9]),
  preparation_units = c(0, 0, 1, 1, 2, 2, 3, NA, 1),
  completed = c(0, 1, 0, 1, 0, 1, 1, 1, NA)
)
groups <- data.frame(
  trial_key = trials$trial_key,
  practice_group = rep(c("Circle", "Square", "Circle"), 3)
)
original_trials <- trials
original_groups <- groups

require_check <- function(ok, message) {
  if (!isTRUE(ok)) stop(message, call. = FALSE)
}
required_fields <- function(x, fields) {
  require_check(all(fields %in% names(x)), "Required fields are missing")
}
unique_keys <- function(x, label) {
  require_check(!anyNA(x$trial_key) && all(nzchar(x$trial_key)) &&
                  !anyDuplicated(x$trial_key), paste(label, "keys must be unique and present"))
}
analyze_trials <- function(activity, lookup) {
  required_fields(activity, c("trial_key", "preparation_units", "completed"))
  required_fields(lookup, c("trial_key", "practice_group"))
  unique_keys(activity, "Activity")
  unique_keys(lookup, "Lookup")
  require_check(is.numeric(activity$completed) &&
                  all(is.na(activity$completed) | activity$completed %in% c(0, 1)),
                "Outcome must be binary or missing")
  require_check(is.numeric(activity$preparation_units) &&
                  all(is.na(activity$preparation_units) |
                        is.finite(activity$preparation_units)), "Predictor must be numeric and finite")
  keys <- match(activity$trial_key, lookup$trial_key)
  require_check(!anyNA(keys), "Every trial needs a lookup match")
  joined <- activity
  joined$practice_group <- lookup$practice_group[keys]
  require_check(!anyNA(joined$practice_group) && all(nzchar(joined$practice_group)),
                "Practice group must be present")
  require_check(nrow(joined) == nrow(activity) &&
                  identical(joined$trial_key, activity$trial_key), "Join changed trial cardinality")
  # Every fixture trial is eligible; a recorded outcome is needed to describe it.
  joined$population <- ifelse(is.na(joined$completed), "Neither: missing outcome",
    ifelse(is.na(joined$preparation_units), "Descriptive only: missing predictor", "Both"))
  descriptive <- joined[!is.na(joined$completed), , drop = FALSE]
  modeling <- descriptive[!is.na(descriptive$preparation_units), , drop = FALSE]
  require_check(nrow(modeling) > 2 && length(unique(modeling$completed)) == 2,
                "Modeling population needs usable trials and both outcome classes")
  matrix <- model.matrix(~ preparation_units, modeling)
  require_check(qr(matrix)$rank == ncol(matrix), "Model matrix must have full rank")
  fit <- glm(completed ~ preparation_units, data = modeling, family = binomial())
  require_check(fit$converged, "Model did not converge")
  require_check(all(is.finite(coef(fit))) && all(is.finite(fitted(fit))),
                "Model outputs must be finite")
  list(joined = joined, descriptive = descriptive, modeling = modeling, fit = fit)
}
result <- analyze_trials(trials, groups)
stopifnot(nrow(result$descriptive) == 8L, nrow(result$modeling) == 7L)
stopifnot(identical(result$joined$trial_key, trials$trial_key))
stopifnot(result$joined$population[8] == "Descriptive only: missing predictor",
          result$joined$population[9] == "Neither: missing outcome")
# Mixed outcomes at the same predictor levels rule out separation in this fixture.
mixed <- split(result$modeling$completed, result$modeling$preparation_units)
stopifnot(all(vapply(mixed[c("0", "1", "2")], function(y) length(unique(y)) == 2, logical(1))))
# Verify fitted estimating equations, not predictive performance.
matrix <- model.matrix(result$fit)
stopifnot(max(abs(crossprod(matrix, result$modeling$completed - fitted(result$fit)))) < 1e-6)
stopifnot(all(is.finite(vcov(result$fit))), all(fitted(result$fit) > 0 & fitted(result$fit) < 1))

expect_rejection <- function(activity, lookup, message) {
  observed <- tryCatch({ analyze_trials(activity, lookup); "Not rejected" },
                       error = function(e) conditionMessage(e))
  require_check(identical(observed, message), paste("Unexpected negative check:", observed))
  observed
}
duplicate <- expect_rejection(trials, rbind(groups, groups[1, ]),
                              "Lookup keys must be unique and present")
invalid <- trials
invalid$completed[1] <- 2
binary <- expect_rejection(invalid, groups, "Outcome must be binary or missing")
unusable <- trials
unusable$preparation_units <- NA_real_
population <- expect_rejection(unusable, groups,
  "Modeling population needs usable trials and both outcome classes")
constant <- trials
constant$preparation_units <- 1
rank <- expect_rejection(constant, groups, "Model matrix must have full rank")
require_check(identical(trials, original_trials) && identical(groups, original_groups),
              "Source objects were modified")

# Presentation-ready strings: the website imports this generated output directly.
table_view <- function(id, caption, headers, rows) {
  list(id = id, caption = caption, headers = as.list(headers), rows = rows)
}
cell <- function(x) ifelse(is.na(x), "Missing", as.character(x))
input_rows <- lapply(seq_len(nrow(result$joined)), function(i) {
  x <- result$joined[i, ]
  as.list(c(x$trial_key, x$practice_group, cell(x$preparation_units),
            cell(x$completed), x$population))
})
population_rows <- list(
  list("Input", as.character(nrow(trials)), "One observation per fictional trial"),
  list("Descriptive", as.character(nrow(result$descriptive)), "Recorded completion outcome"),
  list("Modeling", as.character(nrow(result$modeling)), "Recorded outcome and predictor")
)
descriptive_rows <- lapply(sort(unique(result$descriptive$practice_group)), function(g) {
  x <- result$descriptive[result$descriptive$practice_group == g, ]
  as.list(c(g, as.character(nrow(x)), as.character(sum(x$completed)),
            sprintf("%.1f%%", 100 * mean(x$completed))))
})
slope <- unname(coef(result$fit)["preparation_units"])
model_rows <- list(as.list(c("Preparation units", sprintf("%.3f", slope),
  sprintf("%.3f", exp(slope)), as.character(nrow(result$modeling)))))
check_rows <- list(
  list("Required fields, unique keys and join cardinality", "PASS"),
  list("Binary outcome, explicit exclusions and both model classes", "PASS"),
  list("Full rank; mixed outcomes at shared predictor levels", "PASS"),
  list("Convergence, finite outputs and fitted equation check", "PASS"),
  list("Duplicate lookup fixture", paste("Rejected:", duplicate)),
  list("Invalid outcome fixture", paste("Rejected:", binary)),
  list("Unusable population fixture", paste("Rejected:", population)),
  list("Constant predictor fixture", paste("Rejected:", rank)),
  list("Original input objects unchanged", "PASS")
)
views <- list(
  table_view("trial-input", "Synthetic trials after a one-to-one lookup",
    c("Trial", "Practice group", "Preparation units", "Completed", "Population"), input_rows),
  table_view("trial-populations", "Synthetic population counts",
    c("Population", "Trials", "Inclusion"), population_rows),
  table_view("trial-descriptive", "Synthetic descriptive comparison; not a group effect",
    c("Practice group", "Trials", "Completed", "Completion rate"), descriptive_rows),
  table_view("trial-model", "Synthetic logistic association; completion outcome",
    c("Predictor", "Log-odds coefficient", "Odds ratio per unit", "Model trials"), model_rows),
  table_view("trial-checks", "Checks of this synthetic example only",
    c("Check", "Result"), check_rows)
)
stopifnot(identical(population_rows[[2]][[2]], "8"),
          identical(population_rows[[3]][[2]], "7"),
          identical(descriptive_rows[[1]], list("Circle", "5", "3", "60.0%")),
          identical(descriptive_rows[[2]], list("Square", "3", "2", "66.7%")))
# Small base-R JSON writer for lists of presentation strings; no packages needed.
json_string <- function(x) {
  x <- gsub("\\", "\\\\", x, fixed = TRUE)
  x <- gsub('"', '\\"', x, fixed = TRUE)
  paste0('"', x, '"')
}
json <- function(x) {
  if (is.character(x)) return(json_string(x))
  pieces <- vapply(x, json, character(1))
  if (!is.null(names(x))) {
    pieces <- paste0(vapply(names(x), json_string, character(1)), ":", pieces)
    return(paste0("{", paste(pieces, collapse = ","), "}"))
  }
  paste0("[", paste(pieces, collapse = ","), "]")
}
output <- json(list(tables = views))
args <- commandArgs(trailingOnly = TRUE)
if (length(args) == 1) writeLines(output, args[1], useBytes = TRUE) else cat(output, "\n", sep = "")
